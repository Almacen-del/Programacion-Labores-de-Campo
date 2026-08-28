-- WEB 1: únicamente estados efímeros y un token cifrado. Sin datos del Excel.
-- Deliberadamente no idempotente: una segunda aplicación falla sin sobrescribir.
begin;
create schema arles_oauth_private;
revoke all on schema arles_oauth_private from public, anon, authenticated;

create table arles_oauth_private.states (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  launch_hash text unique check (launch_hash ~ '^[a-f0-9]{64}$'),
  binding_hash text check (binding_hash ~ '^[a-f0-9]{64}$'),
  payload text not null check (length(payload) between 32 and 20000),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);
create table arles_oauth_private.connection (
  id boolean primary key default true check (id),
  token_cipher text not null check (length(token_cipher) between 32 and 20000),
  connected_at timestamptz not null default now(),
  checked_at timestamptz
);
alter table arles_oauth_private.states enable row level security;
alter table arles_oauth_private.connection enable row level security;
revoke all on all tables in schema arles_oauth_private from public, anon, authenticated;

create function public.web1_drive_oauth_begin(p_state_hash text, p_launch_hash text, p_payload text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from arles_oauth_private.connection) then return false; end if;
  delete from arles_oauth_private.states where expires_at <= now();
  insert into arles_oauth_private.states(state_hash, launch_hash, payload)
    values (p_state_hash, p_launch_hash, p_payload);
  return true;
end;
$$;
create function public.web1_drive_oauth_launch(p_launch_hash text, p_binding_hash text)
returns text language sql security definer set search_path = '' as $$
  update arles_oauth_private.states set launch_hash = null, binding_hash = p_binding_hash
  where launch_hash = p_launch_hash and binding_hash is null and expires_at > now()
  returning payload;
$$;
create function public.web1_drive_oauth_consume(p_state_hash text, p_binding_hash text)
returns text language sql security definer set search_path = '' as $$
  delete from arles_oauth_private.states
  where state_hash = p_state_hash and binding_hash = p_binding_hash and expires_at > now()
  returning payload;
$$;
create function public.web1_drive_oauth_connect(p_token_cipher text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare inserted integer;
begin
  insert into arles_oauth_private.connection(token_cipher) values (p_token_cipher)
    on conflict (id) do nothing;
  get diagnostics inserted = row_count;
  return inserted = 1;
end;
$$;
create function public.web1_drive_oauth_read()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('token_cipher', token_cipher, 'connected_at', connected_at,
    'checked_at', checked_at) from arles_oauth_private.connection where id = true;
$$;
create function public.web1_drive_oauth_checked()
returns timestamptz language sql security definer set search_path = '' as $$
  update arles_oauth_private.connection set checked_at = now() where id = true returning checked_at;
$$;

revoke all on function public.web1_drive_oauth_begin(text,text,text) from public, anon, authenticated;
revoke all on function public.web1_drive_oauth_launch(text,text) from public, anon, authenticated;
revoke all on function public.web1_drive_oauth_consume(text,text) from public, anon, authenticated;
revoke all on function public.web1_drive_oauth_connect(text) from public, anon, authenticated;
revoke all on function public.web1_drive_oauth_read() from public, anon, authenticated;
revoke all on function public.web1_drive_oauth_checked() from public, anon, authenticated;
grant execute on function public.web1_drive_oauth_begin(text,text,text) to service_role;
grant execute on function public.web1_drive_oauth_launch(text,text) to service_role;
grant execute on function public.web1_drive_oauth_consume(text,text) to service_role;
grant execute on function public.web1_drive_oauth_connect(text) to service_role;
grant execute on function public.web1_drive_oauth_read() to service_role;
grant execute on function public.web1_drive_oauth_checked() to service_role;
commit;
