-- WEB 3: no modifica el maestro, snapshots previos ni planificación.
begin;
create table arles_web_private.changes (
  id boolean primary key default true check(id), data jsonb not null
);
alter table arles_web_private.changes enable row level security;
revoke all on arles_web_private.changes from public,anon,authenticated;

-- Compara multiconjuntos: mover una fila no equivale a eliminarla y crearla.
-- Sin ID estable, las correcciones por posición solo son candidatas.
create function arles_web_private.compare_records(previous jsonb, current_doc jsonb)
returns jsonb language sql immutable set search_path='' as $$
  with old_rows as (
    select value, value - 'sourceRow' - 'recordHash' as content,
      row_number() over(partition by value - 'sourceRow' - 'recordHash' order by (value->>'sourceRow')::int) occurrence
    from jsonb_array_elements(previous->'records')
  ), new_rows as (
    select value, value - 'sourceRow' - 'recordHash' as content,
      row_number() over(partition by value - 'sourceRow' - 'recordHash' order by (value->>'sourceRow')::int) occurrence
    from jsonb_array_elements(current_doc->'records')
  ), removed as (
    select o.* from old_rows o where not exists(select 1 from new_rows n where n.content=o.content and n.occurrence=o.occurrence)
  ), added as (
    select n.* from new_rows n where not exists(select 1 from old_rows o where n.content=o.content and n.occurrence=o.occurrence)
  ) select jsonb_build_object('added',(select count(*) from added),'removed',(select count(*) from removed),
    'unchanged',(select count(*) from new_rows)-(select count(*) from added),
    'possibleCorrections',(select count(*) from removed o join added n on
      o.value->>'sourceSheet'=n.value->>'sourceSheet' and o.value->>'sourceRow'=n.value->>'sourceRow'));
$$;
revoke all on function arles_web_private.compare_records(jsonb,jsonb) from public,anon,authenticated;
create function arles_web_private.on_web3_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare a jsonb; b jsonb;
begin
  select payload::jsonb into a from arles_sync_private.snapshots where snapshot_hash=old.current_snapshot;
  select payload::jsonb into b from arles_sync_private.snapshots where snapshot_hash=new.current_snapshot;
  insert into arles_web_private.changes values(true,jsonb_build_object(
    'previousHash',old.current_snapshot,'snapshotHash',new.current_snapshot,'comparedAt',now(),
    'counts',case when a is null or b is null then null else arles_web_private.compare_records(a,b) end))
  on conflict(id) do update set data=excluded.data;
  return new;
end;
$$;
revoke all on function arles_web_private.on_web3_change() from public,anon,authenticated;
create trigger web3_changes after update on arles_sync_private.control for each row
  when (old.current_snapshot is distinct from new.current_snapshot)
  execute function arles_web_private.on_web3_change();

create function public.web3_sync_info()
returns jsonb language plpgsql security definer set search_path='' as $$
declare member jsonb; result jsonb;
begin
  member:=arles_web_private.require_member();
  select jsonb_build_object('connection',jsonb_build_object('account','almacen@arlessas.com',
    'connectedAt',(select connected_at from arles_oauth_private.connection where id),
    'checkedAt',(select checked_at from arles_oauth_private.connection where id),
    'canReconnect',member->>'role'='TEST_ADMIN' and member->>'email'='almacen@arlessas.com'),
    'running',coalesce(lease_until>now(),false),'lastSuccessAt',last_success,
    'changes',(select data from arles_web_private.changes where id)) into result
  from arles_sync_private.control where id;
  return result;
end;
$$;
revoke all on function public.web3_sync_info() from public,anon;
grant execute on function public.web3_sync_info() to authenticated;

create function public.web3_reconnect_identity()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare member jsonb;
begin
  member:=arles_web_private.require_member();
  if member->>'role'<>'TEST_ADMIN' or member->>'email'<>'almacen@arlessas.com' then
    raise exception using errcode='42501', message='ACCESS_DENIED';
  end if;
  return member || jsonb_build_object('uid',auth.uid());
end;
$$;
revoke all on function public.web3_reconnect_identity() from public,anon;
grant execute on function public.web3_reconnect_identity() to authenticated;

create function public.web1_drive_oauth_begin_renew(p_state_hash text,p_launch_hash text,p_payload text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(281700);
  if exists(select 1 from arles_oauth_private.states where expires_at>now()+interval '9 minutes') then return false; end if;
  delete from arles_oauth_private.states where expires_at<=now();
  insert into arles_oauth_private.states(state_hash,launch_hash,payload) values(p_state_hash,p_launch_hash,p_payload);
  return true;
end;
$$;
create function public.web1_drive_oauth_connect_renew(p_token_cipher text,p_expected_cipher text,p_actor uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if not exists(select 1 from auth.users u join arles_web_private.members m on m.email=lower(u.email)
    where u.id=p_actor and m.email='almacen@arlessas.com' and m.active and m.role='TEST_ADMIN'
    and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<now())
    and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
      and lower(i.identity_data->>'email')=m.email and i.identity_data->>'email_verified'='true')) then return false; end if;
  -- Compare-and-swap: un callback viejo no reemplaza una conexión más reciente.
  if p_expected_cipher is null then
    insert into arles_oauth_private.connection(token_cipher) values(p_token_cipher) on conflict do nothing;
  else
    update arles_oauth_private.connection set token_cipher=p_token_cipher,connected_at=now(),checked_at=null
      where id and token_cipher=p_expected_cipher;
  end if;
  get diagnostics changed=row_count;
  return changed=1;
end;
$$;
revoke all on function public.web1_drive_oauth_begin_renew(text,text,text) from public,anon,authenticated;
revoke all on function public.web1_drive_oauth_connect_renew(text,text,uuid) from public,anon,authenticated;
grant execute on function public.web1_drive_oauth_begin_renew(text,text,text) to service_role;
grant execute on function public.web1_drive_oauth_connect_renew(text,text,uuid) to service_role;
commit;
