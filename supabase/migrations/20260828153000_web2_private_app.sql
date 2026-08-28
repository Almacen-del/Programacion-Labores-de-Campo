-- WEB 2: proyección consultable de la versión vigente, sin alterar el maestro.
-- La caché se sustituye dentro de la misma transacción que publica el snapshot.
begin;
create schema arles_web_private;
revoke all on schema arles_web_private from public, anon;
grant usage on schema arles_web_private to authenticated;

create table arles_web_private.members (
  email text primary key check (email = lower(email)),
  role text not null check (role in ('TEST_ADMIN','ENGINEER')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into arles_web_private.members(email,role) values
  ('almacen@arlessas.com','TEST_ADMIN'),
  ('dir.siembrasnuevas@arlessas.com','ENGINEER');
alter table arles_web_private.members enable row level security;
revoke all on arles_web_private.members from public,anon,authenticated;
grant usage on schema arles_web_private to supabase_auth_admin;
grant select on arles_web_private.members to supabase_auth_admin;
create policy web2_auth_admission on arles_web_private.members for select to supabase_auth_admin using(true);

-- Autoridad: usuario confirmado en Auth + identidad Google verificada.
-- Nunca se autorizan correos recibidos desde el frontend o user_metadata.
create function arles_web_private.member_identity()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('email',m.email,'role',m.role)
  from arles_web_private.members m join auth.users u on lower(u.email)=m.email
  where u.id=auth.uid() and m.active and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until<now())
    and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
      and lower(i.identity_data->>'email')=m.email and i.identity_data->>'email_verified'='true');
$$;
revoke all on function arles_web_private.member_identity() from public,anon;
grant execute on function arles_web_private.member_identity() to authenticated;
create function arles_web_private.require_member()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare member jsonb;
begin
  member:=arles_web_private.member_identity();
  if member is null then raise exception using errcode='42501',message='ACCESS_DENIED'; end if;
  return member;
end;
$$;
revoke all on function arles_web_private.require_member() from public,anon;
grant execute on function arles_web_private.require_member() to authenticated;

-- Hook exclusivo de Auth: ninguna cuenta ajena puede registrarse, ni por correo.
create function public.web2_before_user_created(event jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if event#>>'{user,app_metadata,provider}'='google'
    and coalesce(event#>>'{user,is_anonymous}','false')='false'
    and exists(select 1 from arles_web_private.members where active
      and email=lower(event#>>'{user,email}')) then return '{}'::jsonb; end if;
  return jsonb_build_object('error',jsonb_build_object('http_code',403,
    'message','Acceso no autorizado. Esta aplicación es privada.'));
end;
$$;
revoke all on function public.web2_before_user_created(jsonb) from public,anon,authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.web2_before_user_created(jsonb) to supabase_auth_admin;

create table arles_web_private.state (
  id boolean primary key default true check(id), data jsonb not null
);
create table arles_web_private.records (
  ordinal integer primary key,
  snapshot_hash text not null,
  work_date date, lot text, labor text,
  validation_state text not null check(validation_state in ('VALID','OBSERVED','BLOCKED')),
  data jsonb not null
);
create index web2_records_date on arles_web_private.records(work_date desc nulls last,ordinal);
create index web2_records_lot on arles_web_private.records(lot);
create index web2_records_labor on arles_web_private.records(labor);
create table arles_web_private.alerts (
  record_ordinal integer not null references arles_web_private.records(ordinal) on delete cascade,
  ordinal integer not null,
  severity text not null,
  data jsonb not null,
  primary key(record_ordinal,ordinal)
);
create table arles_web_private.history (
  snapshot_hash text primary key,
  created_at timestamptz not null,
  summary jsonb not null
);
create table arles_web_private.sync_events (
  id uuid primary key,
  started_at timestamptz not null, finished_at timestamptz,
  status text not null, error_code text
);
create index web2_sync_events_recent on arles_web_private.sync_events(started_at desc);
-- No acceso anónimo; lectura con RLS aun usando la API directamente.
alter table arles_web_private.state enable row level security;
alter table arles_web_private.records enable row level security;
alter table arles_web_private.alerts enable row level security;
alter table arles_web_private.history enable row level security;
alter table arles_web_private.sync_events enable row level security;
revoke all on all tables in schema arles_web_private from public,anon,authenticated;
grant select on arles_web_private.state,arles_web_private.records,arles_web_private.alerts,
  arles_web_private.history,arles_web_private.sync_events to authenticated;
create policy web2_state_read on arles_web_private.state for select to authenticated
  using ((select arles_web_private.member_identity()) is not null);
create policy web2_records_read on arles_web_private.records for select to authenticated
  using ((select arles_web_private.member_identity()) is not null);
create policy web2_alerts_read on arles_web_private.alerts for select to authenticated
  using ((select arles_web_private.member_identity()) is not null);
create policy web2_history_read on arles_web_private.history for select to authenticated
  using ((select arles_web_private.member_identity()) is not null);
create policy web2_events_read on arles_web_private.sync_events for select to authenticated
  using ((select arles_web_private.member_identity()) is not null);

create function arles_web_private.refresh_projection()
returns void language plpgsql security definer set search_path = '' as $$
declare ctl arles_sync_private.control%rowtype; snap arles_sync_private.snapshots%rowtype;
  previous_hash text; document jsonb;
begin
  select * into ctl from arles_sync_private.control where id=true;
  select data->>'snapshotHash' into previous_hash from arles_web_private.state where id=true;
  select * into snap from arles_sync_private.snapshots where snapshot_hash=ctl.current_snapshot;
  if ctl.current_snapshot is distinct from previous_hash then
    -- Solo caché derivada vigente; NO borra los snapshots históricos de WEB 1.
    delete from arles_web_private.alerts;
    delete from arles_web_private.records;
    if snap.snapshot_hash is not null then
      document:=snap.payload::jsonb;
      insert into arles_web_private.records(ordinal,snapshot_hash,work_date,lot,labor,validation_state,data)
      select ordinality::integer,snap.snapshot_hash,nullif(value->>'workDate','')::date,
        value->>'lot',value->>'labor',value->>'validationState',value
      from jsonb_array_elements(document->'records') with ordinality;
      insert into arles_web_private.alerts(record_ordinal,ordinal,severity,data)
      select r.ordinal,a.ordinality::integer,a.value->>'severity',a.value
      from arles_web_private.records r cross join lateral jsonb_array_elements(r.data->'alerts') with ordinality a;
    end if;
  end if;
  insert into arles_web_private.history select snapshot_hash,created_at,summary
    from arles_sync_private.snapshots on conflict do nothing;
  insert into arles_web_private.state(id,data) values(true,jsonb_build_object(
    'snapshotHash',ctl.current_snapshot,'importedAt',snap.created_at,
    'sourceModifiedAt',ctl.source_meta->>'modifiedTime','sourceVersion',ctl.source_meta->>'version',
    'lastCheckedAt',ctl.last_checked,'lastSuccessAt',ctl.last_success,'lastError',ctl.last_error,
    'summary',snap.summary,'sheets',case when snap.payload is null then '[]'::jsonb
      when document is not null then document->'sheets'
      else (select data->'sheets' from arles_web_private.state where id=true) end,
    'fileName','MA-F-009 PROGRAMACIÓN DE LABORES CAMPO.xlsx','intervalMinutes',5))
  on conflict(id) do update set data=excluded.data;
end;
$$;
revoke all on function arles_web_private.refresh_projection() from public,anon,authenticated;
create function arles_web_private.on_sync_control()
returns trigger language plpgsql security definer set search_path = '' as $$
begin perform arles_web_private.refresh_projection(); return new; end;
$$;
revoke all on function arles_web_private.on_sync_control() from public,anon,authenticated;
create trigger web2_sync_projection after update on arles_sync_private.control
  for each row when (old.current_snapshot is distinct from new.current_snapshot
    or old.last_checked is distinct from new.last_checked or old.last_error is distinct from new.last_error)
  execute function arles_web_private.on_sync_control();
create function arles_web_private.on_sync_run()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into arles_web_private.sync_events values(new.id,new.started_at,new.finished_at,new.status,new.error_code)
    on conflict(id) do update set finished_at=excluded.finished_at,status=excluded.status,error_code=excluded.error_code;
  return new;
end;
$$;
revoke all on function arles_web_private.on_sync_run() from public,anon,authenticated;
create trigger web2_sync_events after insert or update on arles_sync_private.runs
  for each row execute function arles_web_private.on_sync_run();
select arles_web_private.refresh_projection();
insert into arles_web_private.sync_events select id,started_at,finished_at,status,error_code from arles_sync_private.runs;

-- API de lectura: SECURITY INVOKER conserva el usuario y sus políticas RLS.
create function public.web2_bootstrap()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare member jsonb; result jsonb;
begin
  member:=arles_web_private.require_member();
  select data into result from arles_web_private.state where id=true;
  return jsonb_build_object('member',member,'master',result);
end;
$$;
create function public.web2_records(p_snapshot text, p_offset integer default 0, p_limit integer default 50,
  p_from date default null, p_to date default null, p_lot text default null,
  p_labor text default null, p_state text default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare current_hash text; total_rows integer; result jsonb;
begin
  perform arles_web_private.require_member();
  if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>100
    or (p_from is not null and p_to is not null and p_from>p_to)
    or length(p_lot)>250 or length(p_labor)>250
    or (p_state is not null and p_state not in ('VALID','OBSERVED','BLOCKED'))
    then raise exception using errcode='22023',message='INVALID_FILTER'; end if;
  select data->>'snapshotHash' into current_hash from arles_web_private.state where id=true;
  if current_hash is distinct from p_snapshot then raise exception using errcode='40001',message='SNAPSHOT_CHANGED'; end if;
  select count(*) into total_rows from arles_web_private.records r
    where (p_from is null or work_date>=p_from) and (p_to is null or work_date<=p_to)
      and (p_lot is null or lot=p_lot) and (p_labor is null or labor=p_labor)
      and (p_state is null or validation_state=p_state);
  select coalesce(jsonb_agg(item order by work_date desc nulls last,ordinal),'[]') into result from (
    select ordinal,work_date,(data-'rawValues')||jsonb_build_object('ordinal',ordinal) item
    from arles_web_private.records where (p_from is null or work_date>=p_from) and (p_to is null or work_date<=p_to)
      and (p_lot is null or lot=p_lot) and (p_labor is null or labor=p_labor)
      and (p_state is null or validation_state=p_state)
    order by work_date desc nulls last,ordinal limit p_limit offset p_offset
  ) page;
  return jsonb_build_object('snapshotHash',current_hash,'total',total_rows,'rows',result);
end;
$$;
create function public.web2_record(p_snapshot text,p_ordinal integer)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare current_hash text; result jsonb;
begin
  perform arles_web_private.require_member();
  select data->>'snapshotHash' into current_hash from arles_web_private.state where id=true;
  if current_hash is distinct from p_snapshot then raise exception using errcode='40001',message='SNAPSHOT_CHANGED'; end if;
  select data||jsonb_build_object('ordinal',ordinal) into result from arles_web_private.records where ordinal=p_ordinal;
  return result;
end;
$$;
create function public.web2_alerts(p_snapshot text,p_offset integer default 0,p_limit integer default 50)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare current_hash text; result jsonb;
begin
  perform arles_web_private.require_member();
  if p_offset is null or p_offset<0 or p_offset>1000000 or p_limit is null or p_limit<1 or p_limit>100
    then raise exception using errcode='22023',message='INVALID_FILTER'; end if;
  select data->>'snapshotHash' into current_hash from arles_web_private.state where id=true;
  if current_hash is distinct from p_snapshot then raise exception using errcode='40001',message='SNAPSHOT_CHANGED'; end if;
  select coalesce(jsonb_agg(item order by record_ordinal,ordinal),'[]') into result from (
    select a.record_ordinal,a.ordinal,a.data||jsonb_build_object('ordinal',a.ordinal,'recordOrdinal',a.record_ordinal,
      'lot',r.lot,'labor',r.labor,'sourceSheet',r.data->>'sourceSheet','sourceRow',r.data->'sourceRow') item
    from arles_web_private.alerts a join arles_web_private.records r on r.ordinal=a.record_ordinal
    order by a.record_ordinal,a.ordinal limit p_limit offset p_offset
  ) page;
  return jsonb_build_object('rows',result,'total',(select count(*) from arles_web_private.alerts));
end;
$$;
create function public.web2_filters()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  perform arles_web_private.require_member();
  return jsonb_build_object(
    'lots',(select coalesce(jsonb_agg(lot order by lot),'[]') from (select distinct lot from arles_web_private.records where lot is not null) t),
    'labors',(select coalesce(jsonb_agg(labor order by labor),'[]') from (select distinct labor from arles_web_private.records where labor is not null) t));
end;
$$;
create function public.web2_history()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  perform arles_web_private.require_member();
  return jsonb_build_object(
    'versions',(select coalesce(jsonb_agg(to_jsonb(t) order by created_at desc),'[]') from
      (select * from arles_web_private.history order by created_at desc limit 20) t),
    'runs',(select coalesce(jsonb_agg(to_jsonb(t) order by started_at desc),'[]') from
      (select * from arles_web_private.sync_events order by started_at desc limit 20) t));
end;
$$;
revoke all on function public.web2_bootstrap() from public,anon;
revoke all on function public.web2_records(text,integer,integer,date,date,text,text,text) from public,anon;
revoke all on function public.web2_record(text,integer) from public,anon;
revoke all on function public.web2_alerts(text,integer,integer) from public,anon;
revoke all on function public.web2_filters() from public,anon;
revoke all on function public.web2_history() from public,anon;
grant execute on function public.web2_bootstrap(),public.web2_records(text,integer,integer,date,date,text,text,text),
  public.web2_record(text,integer),public.web2_alerts(text,integer,integer),public.web2_filters(),public.web2_history() to authenticated;
commit;
