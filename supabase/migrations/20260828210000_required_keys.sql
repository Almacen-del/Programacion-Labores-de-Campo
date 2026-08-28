-- Regla solicitada antes de WEB 6. Requiere respaldo externo verificado antes de aplicar.
-- No crea una lista de exclusión: cada nueva lectura decide de nuevo por contenido.
begin;
select id from arles_sync_private.control where id for update;
do $$ begin
 if exists(select 1 from arles_sync_private.control where lease_until>now()) then raise exception 'SYNC_BUSY'; end if;
end $$;
select pg_advisory_xact_lock(281930);

create function arles_sync_private.has_required_keys(r jsonb)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(r->'lot')='string' and (r->>'lot') ~ '[^[:space:] ]'
  and jsonb_typeof(r->'plantingYear')='number' and (r->>'plantingYear') ~ '^-?[0-9]+$',false);
$$;
revoke all on function arles_sync_private.has_required_keys(jsonb) from public,anon,authenticated;

create function arles_sync_private.filter_master(doc jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare records jsonb; sheets jsonb; summary jsonb;
begin
 if jsonb_typeof(doc->'records') is distinct from 'array' or jsonb_typeof(doc->'sheets') is distinct from 'array'
  then raise exception 'EMPTY_MASTER'; end if;
 select coalesce(jsonb_agg(r order by n),'[]') into records from jsonb_array_elements(doc->'records') with ordinality t(r,n)
  where arles_sync_private.has_required_keys(r);
 select jsonb_build_object('total',count(*),'valid',count(*) filter(where r->>'validationState'='VALID'),
  'observed',count(*) filter(where r->>'validationState'='OBSERVED'),'blocked',count(*) filter(where r->>'validationState'='BLOCKED'),
  'alerts',coalesce(sum(jsonb_array_length(r->'alerts')),0)) into summary from jsonb_array_elements(records) r;
 select coalesce(jsonb_agg(s || jsonb_build_object('importedRowCount',
  (select count(*) from jsonb_array_elements(records) r where r->>'sourceSheet'=s->>'name')) order by n),'[]') into sheets
  from jsonb_array_elements(doc->'sheets') with ordinality t(s,n);
 return doc || jsonb_build_object('records',records,'sheets',sheets,'summary',summary);
end;
$$;
revoke all on function arles_sync_private.filter_master(jsonb) from public,anon,authenticated;

create function arles_sync_private.filter_inventory(doc jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare rows jsonb; formulas jsonb; totals jsonb; summary jsonb; warnings jsonb;
begin
 if jsonb_typeof(doc->'rows') is distinct from 'array' then raise exception 'INVALID_INVENTORY'; end if;
 select coalesce(jsonb_agg(r order by n),'[]') into rows from jsonb_array_elements(doc->'rows') with ordinality t(r,n)
  where arles_sync_private.has_required_keys(r);
 select coalesce(jsonb_object_agg(f.key,f.value),'{}') into formulas from jsonb_array_elements(rows) r
  cross join lateral jsonb_each(coalesce(r->'formulas','{}')) f;
 select jsonb_build_object(
  'area',sum(case when jsonb_typeof(r->'area')='number' then (r->>'area')::numeric end),
  'areaAlqueria',sum(case when jsonb_typeof(r->'areaAlqueria')='number' then (r->>'areaAlqueria')::numeric end),
  'totalAlive',sum(case when jsonb_typeof(r->'totalAlive')='number' then (r->>'totalAlive')::numeric end),
  'planted',sum(case when jsonb_typeof(r->'trees')='number' then (r->>'trees')::numeric end)) into totals from jsonb_array_elements(rows) r;
 select jsonb_build_object('rows',count(*),'review',count(*) filter(where r->>'state'='REVIEW'),
  'formulaCells',(select count(*) from jsonb_object_keys(formulas))) into summary from jsonb_array_elements(rows) r;
 select coalesce(jsonb_agg(w order by n),'[]') into warnings from jsonb_array_elements(coalesce(doc->'warnings','[]')) with ordinality t(w,n)
  where w#>>'{}' not like 'El total de %';
 return (doc-'sourceTotals'-'calculated'-'reconciliation'-'totalsRows') || jsonb_build_object('rows',rows,'formulas',formulas,
  'summary',summary,'includedTotals',totals,'warnings',warnings,'inclusionRule','lot-planting-year-v1');
end;
$$;
revoke all on function arles_sync_private.filter_inventory(jsonb) from public,anon,authenticated;

create function arles_sync_private.inventory_required_keys()
returns trigger language plpgsql security definer set search_path='' as $$
begin new.payload:=arles_sync_private.filter_inventory(new.payload); return new; end;
$$;
revoke all on function arles_sync_private.inventory_required_keys() from public,anon,authenticated;
create trigger inventory_required_keys before insert or update of payload on arles_web_private.inventory_versions
 for each row execute function arles_sync_private.inventory_required_keys();

-- Reescribe únicamente derivados históricos; mantiene fuentes, fechas y confirmaciones.
create temporary table required_keys_map on commit drop as
 select s.snapshot_hash old_hash,encode(sha256(convert_to(x.payload,'UTF8')),'hex') new_hash,
  x.payload,s.file_hash,s.parser_revision,s.created_at
 from arles_sync_private.snapshots s cross join lateral
  (select arles_sync_private.filter_master(s.payload::jsonb)::text payload) x;
insert into arles_sync_private.snapshots(snapshot_hash,file_hash,parser_revision,payload,json_bytes,summary,created_at)
 select distinct on(new_hash) new_hash,file_hash,parser_revision,payload,octet_length(payload),payload::jsonb->'summary',created_at
 from required_keys_map order by new_hash,created_at on conflict(snapshot_hash) do nothing;
alter table arles_sync_private.control disable trigger web3_changes;
update arles_sync_private.control c set current_snapshot=m.new_hash from required_keys_map m where c.current_snapshot=m.old_hash;
alter table arles_sync_private.control enable trigger web3_changes;
update arles_sync_private.runs r set snapshot_hash=m.new_hash from required_keys_map m where r.snapshot_hash=m.old_hash;
delete from arles_sync_private.snapshots s using required_keys_map m where s.snapshot_hash=m.old_hash
 and not exists(select 1 from required_keys_map n where n.new_hash=s.snapshot_hash);
delete from arles_web_private.history h where not exists(select 1 from arles_sync_private.snapshots s where s.snapshot_hash=h.snapshot_hash);
insert into arles_web_private.history select snapshot_hash,created_at,summary from arles_sync_private.snapshots
 on conflict(snapshot_hash) do update set summary=excluded.summary;
delete from arles_web_private.changes;
update arles_web_private.inventory_versions set payload=arles_sync_private.filter_inventory(payload);

-- Defensa de persistencia: ninguna escritura puede guardar filas sin ambas claves.
create function arles_sync_private.all_required_keys(rows jsonb)
returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(rows)='array' and not exists(select 1 from jsonb_array_elements(rows) r where not arles_sync_private.has_required_keys(r));
$$;
revoke all on function arles_sync_private.all_required_keys(jsonb) from public,anon,authenticated;
alter table arles_sync_private.snapshots add constraint snapshots_required_keys check(arles_sync_private.all_required_keys(payload::jsonb->'records'));
alter table arles_web_private.records add constraint records_required_keys check(arles_sync_private.has_required_keys(data));

-- Las definiciones de ingesta y consulta actualizadas se agregan a continuación.
create or replace function public.web1_sync_finish(p_run_id uuid, p_status text, p_meta jsonb,
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
    if jsonb_typeof(document->'records') <> 'array' or false
      or (document->'summary'->>'total')::integer <> jsonb_array_length(document->'records') then raise exception 'EMPTY_MASTER'; end if;
    document := arles_sync_private.filter_master(document);
    p_payload := document::text;
    p_snapshot_hash := encode(sha256(convert_to(p_payload,'UTF8')),'hex');
    size_bytes := octet_length(p_payload);
    if size_bytes > 10485760 then raise exception 'SNAPSHOT_TOO_LARGE'; end if;
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

create or replace function public.web5_stage_inventory(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare version_id uuid;
begin
 if p_payload is not null and jsonb_typeof(p_payload->'rows')='array' then
  p_payload:=arles_sync_private.filter_inventory(p_payload);
 end if;
 if p_payload is null or p_payload->>'schema' is distinct from 'arles-inventory-v1'
  or coalesce(p_payload->>'fileHash','')!~'^[a-f0-9]{64}$' or octet_length(p_payload::text)>1048576
  or jsonb_typeof(p_payload->'rows') is distinct from 'array'
  then raise exception using errcode='22023',message='INVALID_INVENTORY'; end if;
 if jsonb_array_length(p_payload->'rows') not between 0 and 10000 then raise exception using errcode='22023',message='INVALID_INVENTORY'; end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'rows') r where
  jsonb_typeof(r->'lot') is distinct from 'string' or coalesce(length(r->>'lot'),0) not between 1 and 250
  or coalesce(r->>'state','') not in ('VALID','REVIEW') or jsonb_typeof(r->'issues') is distinct from 'array'
  or jsonb_typeof(r->'rawValues') is distinct from 'array' or coalesce(r->>'sourceSheet','')=''
  or coalesce(r->>'sourceRow','')!~'^[1-9][0-9]{0,6}$'
  or coalesce(r->>'ordinal','')!~'^[1-9][0-9]{0,6}$') then raise exception using errcode='22023',message='INVALID_INVENTORY'; end if;
 if (select count(distinct r->>'ordinal') from jsonb_array_elements(p_payload->'rows') r)<>jsonb_array_length(p_payload->'rows')
  then raise exception using errcode='22023',message='INVALID_INVENTORY'; end if;
 perform pg_advisory_xact_lock(281930);
 select id into version_id from arles_web_private.inventory_versions where file_hash=p_payload->>'fileHash';
 if version_id is not null then return jsonb_build_object('id',version_id,'status','ALREADY_STAGED'); end if;
 if (select count(*) from arles_web_private.inventory_versions)>=100
  or (select coalesce(sum(pg_column_size(payload)),0) from arles_web_private.inventory_versions)>26214400
  or pg_database_size(current_database())>419430400 then raise exception 'STORAGE_LIMIT'; end if;
 insert into arles_web_private.inventory_versions(file_hash,payload) values(p_payload->>'fileHash',p_payload) returning id into version_id;
 return jsonb_build_object('id',version_id,'status','DRAFT');
end;
$$;

create or replace function public.web5_inventory(p_version uuid default null,p_as_of date default null,
 p_offset integer default 0,p_search text default null,p_state text default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare version arles_web_private.inventory_versions%rowtype; previous arles_web_private.inventory_versions%rowtype;
 versions jsonb; rows_result jsonb; total integer; comparison jsonb;
begin
 perform arles_web_private.require_member();
 if p_offset is null or p_offset<0 or p_offset>1000000 or length(p_search)>250
  or (p_state is not null and p_state<>'REVIEW') or (p_version is not null and p_as_of is not null)
  then raise exception using errcode='22023',message='INVALID_FILTER'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'fileName',payload->>'fileName','createdAt',created_at,
  'effectiveDate',effective_date,'confirmedAt',confirmed_at,'summary',payload->'summary') order by created_at desc,id),'[]')
  into versions from arles_web_private.inventory_versions;
 select * into version from arles_web_private.inventory_versions
  where (p_version is null or id=p_version) and (p_as_of is null or effective_date<=p_as_of)
  order by case when p_as_of is not null then effective_date end desc nulls last,created_at desc,id limit 1;
 if version.id is null then return jsonb_build_object('versions',versions,'version',null,'rows','[]'::jsonb,'total',0); end if;
 select * into previous from arles_web_private.inventory_versions
  where id<>version.id and effective_date is not null and
    (version.effective_date is null or effective_date<version.effective_date)
  order by effective_date desc limit 1;
 if previous.id is not null then
  -- Multiconjunto por contenido sin posición: preserva duplicados, no inventa correcciones.
  with old_rows as (select r-'ordinal'-'sourceRow'-'formulas' val from jsonb_array_elements(previous.payload->'rows') r),
  new_rows as (select r-'ordinal'-'sourceRow'-'formulas' val from jsonb_array_elements(version.payload->'rows') r),
  added as (select val from new_rows except all select val from old_rows),removed as (select val from old_rows except all select val from new_rows)
  select jsonb_build_object('previousId',previous.id,'previousDate',previous.effective_date,
   'added',(select count(*) from added),'removed',(select count(*) from removed)) into comparison;
 end if;
 select count(*) into total from jsonb_array_elements(version.payload->'rows') r
  where (p_search is null or position(lower(p_search) in lower(r->>'lot'))>0) and (p_state is null or r->>'state'=p_state);
 select coalesce(jsonb_agg(item order by ordinal),'[]') into rows_result from (
  select (r->>'ordinal')::int ordinal,r || jsonb_build_object('masterMatch',
   (select count(*) from jsonb_array_elements(version.payload->'rows') x where x->>'lot'=r->>'lot')=1
   and exists(select 1 from arles_web_private.records m where m.lot=r->>'lot')) item
  from jsonb_array_elements(version.payload->'rows') r where
   (p_search is null or position(lower(p_search) in lower(r->>'lot'))>0) and (p_state is null or r->>'state'=p_state)
  order by (r->>'ordinal')::int limit 25 offset p_offset
 ) page;
 return jsonb_build_object('versions',versions,'version',jsonb_build_object('id',version.id,'fileHash',version.file_hash,
  'fileName',version.payload->>'fileName','periodLabel',version.payload->>'periodLabel','createdAt',version.created_at,
  'effectiveDate',version.effective_date,'confirmationNote',version.confirmation_note,'summary',version.payload->'summary',
  'warnings',version.payload->'warnings','includedTotals',version.payload->'includedTotals',
  'sourceTotals',version.payload->'includedTotals','reconciliation','[]'::jsonb),
  'comparison',comparison,'total',total,'rows',rows_result);
end;
$$;
commit;
