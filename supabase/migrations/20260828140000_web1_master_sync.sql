-- WEB 1: no elimina versiones, datos existentes ni credenciales OAuth.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create schema arles_sync_private;
revoke all on schema arles_sync_private from public, anon, authenticated;

create table arles_sync_private.snapshots (
  snapshot_hash text primary key check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  file_hash text not null check (file_hash ~ '^[a-f0-9]{64}$'),
  parser_revision text not null check (parser_revision = 'ma-f-009-v1'),
  payload text not null,
  json_bytes integer not null check (json_bytes between 1 and 10485760),
  summary jsonb not null,
  created_at timestamptz not null default now()
);
create table arles_sync_private.control (
  id boolean primary key default true check (id),
  current_snapshot text references arles_sync_private.snapshots(snapshot_hash),
  file_hash text, source_stamp text, source_meta jsonb,
  last_checked timestamptz, last_success timestamptz, last_error text,
  lease_id uuid, lease_until timestamptz
);
insert into arles_sync_private.control(id) values (true);
create table arles_sync_private.dispatches (
  id uuid primary key default gen_random_uuid(),
  queued_at timestamptz not null default now(),
  request_id bigint
);
create table arles_sync_private.runs (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid unique references arles_sync_private.dispatches(id),
  started_at timestamptz not null default now(), finished_at timestamptz,
  status text not null default 'RUNNING' check (status in ('RUNNING','UPDATED','UNCHANGED','ERROR')),
  snapshot_hash text references arles_sync_private.snapshots(snapshot_hash),
  metrics jsonb not null default '{}', error_code text
);
alter table arles_sync_private.snapshots enable row level security;
alter table arles_sync_private.control enable row level security;
alter table arles_sync_private.dispatches enable row level security;
alter table arles_sync_private.runs enable row level security;
revoke all on all tables in schema arles_sync_private from public, anon, authenticated;

create function public.web1_sync_begin(p_dispatch_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ctl arles_sync_private.control%rowtype; new_id uuid;
begin
  select * into ctl from arles_sync_private.control where id = true for update;
  if ctl.lease_until > now() then return null; end if;
  if (select count(*) from arles_sync_private.runs) >= 50000 then raise exception 'LOG_LIMIT'; end if;
  if p_dispatch_id is not null and (not exists(select 1 from arles_sync_private.dispatches where id=p_dispatch_id)
    or exists(select 1 from arles_sync_private.runs where dispatch_id=p_dispatch_id)) then raise exception 'LEASE_LOST'; end if;
  if ctl.lease_id is not null then
    update arles_sync_private.runs set status='ERROR', finished_at=now(), error_code='LEASE_EXPIRED'
    where id=ctl.lease_id and status='RUNNING';
  end if;
  insert into arles_sync_private.runs(dispatch_id) values(p_dispatch_id) returning id into new_id;
  update arles_sync_private.control set lease_id=new_id, lease_until=now()+interval '180 seconds' where id=true;
  return jsonb_build_object('run_id',new_id,'current',case when ctl.current_snapshot is null then null else
    jsonb_build_object('snapshot_hash',ctl.current_snapshot,'file_hash',ctl.file_hash,
      'source_stamp',ctl.source_stamp,'parser_revision','ma-f-009-v1') end);
end;
$$;

create function public.web1_sync_finish(p_run_id uuid, p_status text, p_meta jsonb,
  p_file_hash text, p_snapshot_hash text, p_payload text, p_metrics jsonb, p_error_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ctl arles_sync_private.control%rowtype; document jsonb; size_bytes integer; summary_result jsonb;
begin
  select * into ctl from arles_sync_private.control where id=true for update;
  if ctl.lease_id is distinct from p_run_id or ctl.lease_until <= now() then raise exception 'LEASE_LOST'; end if;
  if p_status not in ('UPDATED','UNCHANGED','ERROR') then raise exception 'DATABASE_FAILED'; end if;
  if p_status = 'ERROR' then
    update arles_sync_private.runs set status='ERROR', finished_at=now(), metrics=p_metrics,
      error_code=left(coalesce(p_error_code,'DATABASE_FAILED'),64) where id=p_run_id;
    update arles_sync_private.control set last_checked=now(), last_error=left(coalesce(p_error_code,'DATABASE_FAILED'),64),
      lease_id=null, lease_until=null where id=true;
    return jsonb_build_object('preserved_snapshot',ctl.current_snapshot);
  end if;
  if p_meta->>'stamp' is null or p_file_hash !~ '^[a-f0-9]{64}$' or p_snapshot_hash !~ '^[a-f0-9]{64}$'
    then raise exception 'DATABASE_FAILED'; end if;
  if p_payload is not null then
    size_bytes := octet_length(p_payload);
    if size_bytes > 10485760 then raise exception 'SNAPSHOT_TOO_LARGE'; end if;
    if encode(sha256(convert_to(p_payload,'UTF8')),'hex') <> p_snapshot_hash then raise exception 'DATABASE_FAILED'; end if;
    document := p_payload::jsonb;
    if jsonb_typeof(document->'records') <> 'array' or jsonb_array_length(document->'records')=0
      or (document->'summary'->>'total')::integer <> jsonb_array_length(document->'records') then raise exception 'EMPTY_MASTER'; end if;
    if not exists(select 1 from arles_sync_private.snapshots where snapshot_hash=p_snapshot_hash) then
      if (select count(*) from arles_sync_private.snapshots) >= 100
        or (select coalesce(sum(json_bytes),0) from arles_sync_private.snapshots)+size_bytes > 104857600
        or pg_database_size(current_database()) >= 419430400 then raise exception 'STORAGE_LIMIT'; end if;
      insert into arles_sync_private.snapshots(snapshot_hash,file_hash,parser_revision,payload,json_bytes,summary)
        values(p_snapshot_hash,p_file_hash,'ma-f-009-v1',p_payload,size_bytes,document->'summary');
    end if;
  end if;
  select summary into summary_result from arles_sync_private.snapshots where snapshot_hash=p_snapshot_hash;
  if not found then raise exception 'DATABASE_FAILED'; end if;
  update arles_sync_private.control set current_snapshot=p_snapshot_hash, file_hash=p_file_hash,
    source_stamp=p_meta->>'stamp',source_meta=p_meta,last_checked=now(),last_success=now(),last_error=null,
    lease_id=null,lease_until=null where id=true;
  update arles_sync_private.runs set status=p_status,finished_at=now(),snapshot_hash=p_snapshot_hash,metrics=p_metrics where id=p_run_id;
  return jsonb_build_object('snapshotHash',p_snapshot_hash,'summary',summary_result,'checkedAt',now());
end;
$$;

-- Solo el trabajo cron, ejecutado por postgres, llama esta función privada.
create function arles_sync_private.dispatch()
returns bigint language plpgsql security definer set search_path = '' as $$
declare dispatch_id uuid; net_id bigint; secret_value text;
begin
  if (select count(*) from arles_sync_private.dispatches) >= 50000 then
    update arles_sync_private.control set last_error='LOG_LIMIT' where id=true; return null;
  end if;
  select decrypted_secret into strict secret_value from vault.decrypted_secrets where name='arles_master_sync_dispatch';
  insert into arles_sync_private.dispatches default values returning id into dispatch_id;
  select net.http_post(url:='https://dziwhbjyvxdbplthpazt.supabase.co/functions/v1/master-sync/run',
    headers:=jsonb_build_object('Authorization','Bearer '||secret_value,'Content-Type','application/json','x-arles-dispatch-id',dispatch_id::text),
    body:='{}'::jsonb,timeout_milliseconds:=120000) into net_id;
  update arles_sync_private.dispatches set request_id=net_id where id=dispatch_id;
  return net_id;
end;
$$;
revoke all on function arles_sync_private.dispatch() from public,anon,authenticated;

create function public.web1_sync_schedule(p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing_secret text; existing_job cron.job%rowtype; job_id bigint;
begin
  perform pg_advisory_xact_lock(433631251791);
  if p_secret !~ '^[a-f0-9]{64}$' then raise exception 'DATABASE_FAILED'; end if;
  if not exists(select 1 from arles_sync_private.control where current_snapshot is not null and last_success is not null)
    then raise exception 'DATABASE_FAILED'; end if;
  select decrypted_secret into existing_secret from vault.decrypted_secrets where name='arles_master_sync_dispatch';
  if found and existing_secret is distinct from p_secret then raise exception 'DATABASE_FAILED'; end if;
  if existing_secret is null then perform vault.create_secret(p_secret,'arles_master_sync_dispatch','Autenticación exclusiva de la sincronización del maestro Arles'); end if;
  select * into existing_job from cron.job where jobname='arles-master-sync-5min';
  if found then
    if existing_job.schedule <> '*/5 * * * *' or existing_job.command <> 'select arles_sync_private.dispatch();' or not existing_job.active
      then raise exception 'DATABASE_FAILED'; end if;
    job_id := existing_job.jobid;
  else
    select cron.schedule('arles-master-sync-5min','*/5 * * * *','select arles_sync_private.dispatch();') into job_id;
  end if;
  return jsonb_build_object('scheduled',true,'jobId',job_id,'intervalMinutes',5);
end;
$$;

create function public.web1_sync_status()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'current',(select jsonb_build_object('snapshotHash',c.current_snapshot,'fileHash',c.file_hash,
      'summary',s.summary,'snapshotJsonBytes',s.json_bytes,'lastChecked',c.last_checked,'lastSuccess',c.last_success,
      'lastError',c.last_error,'source',c.source_meta) from arles_sync_private.control c
      left join arles_sync_private.snapshots s on s.snapshot_hash=c.current_snapshot),
    'storage',jsonb_build_object('databaseBytes',pg_database_size(current_database()),
      'syncRelationBytes',(select coalesce(sum(pg_total_relation_size(c.oid)),0) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='arles_sync_private' and c.relkind='r'),
      'snapshotCount',(select count(*) from arles_sync_private.snapshots),
      'snapshotJsonBytes',(select coalesce(sum(json_bytes),0) from arles_sync_private.snapshots),
      'runCount',(select count(*) from arles_sync_private.runs)),
    'runs',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from
      (select id,dispatch_id,started_at,finished_at,status,snapshot_hash,metrics,error_code from arles_sync_private.runs order by started_at desc limit 10) r),
    'dispatches',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from
      (select d.id,d.queued_at,d.request_id,r.status_code,r.timed_out from arles_sync_private.dispatches d
        left join net._http_response r on r.id=d.request_id order by d.queued_at desc limit 10) d),
    'schedule',(select jsonb_build_object('jobId',jobid,'active',active,'schedule',schedule) from cron.job where jobname='arles-master-sync-5min'),
    'cronRuns',(select coalesce(jsonb_agg(to_jsonb(j)),'[]') from
      (select j.runid,j.start_time,j.end_time,j.status from cron.job_run_details j join cron.job c on c.jobid=j.jobid
        where c.jobname='arles-master-sync-5min' order by j.start_time desc limit 5) j)
  );
$$;
revoke all on function public.web1_sync_begin(uuid) from public,anon,authenticated;
revoke all on function public.web1_sync_finish(uuid,text,jsonb,text,text,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.web1_sync_status() from public,anon,authenticated;
revoke all on function public.web1_sync_schedule(text) from public,anon,authenticated;
grant execute on function public.web1_sync_begin(uuid) to service_role;
grant execute on function public.web1_sync_finish(uuid,text,jsonb,text,text,text,jsonb,text) to service_role;
grant execute on function public.web1_sync_status() to service_role;
grant execute on function public.web1_sync_schedule(text) to service_role;
commit;
