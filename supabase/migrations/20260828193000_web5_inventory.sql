begin;
create table arles_web_private.inventory_versions(
 id uuid primary key default gen_random_uuid(),file_hash text unique not null check(file_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),effective_date date unique,
 confirmed_at timestamptz,confirmed_by uuid,confirmation_note text,
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 check((effective_date is null and confirmed_at is null) or (effective_date is not null and confirmed_at is not null))
);
alter table arles_web_private.inventory_versions enable row level security;
revoke all on arles_web_private.inventory_versions from public,anon,authenticated;
grant select on arles_web_private.inventory_versions to authenticated;
create policy web5_inventory_read on arles_web_private.inventory_versions for select to authenticated
 using((select arles_web_private.member_identity()) is not null);

-- Ingesta de servidor separada de confirmar una versión. Nunca publica por sí sola.
create function public.web5_stage_inventory(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare version_id uuid;
begin
 if p_payload is null or p_payload->>'schema' is distinct from 'arles-inventory-v1'
  or coalesce(p_payload->>'fileHash','')!~'^[a-f0-9]{64}$' or octet_length(p_payload::text)>1048576
  or jsonb_typeof(p_payload->'rows') is distinct from 'array'
  then raise exception using errcode='22023',message='INVALID_INVENTORY'; end if;
 if jsonb_array_length(p_payload->'rows') not between 1 and 10000 then raise exception using errcode='22023',message='INVALID_INVENTORY'; end if;
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
revoke all on function public.web5_stage_inventory(jsonb) from public,anon,authenticated;
grant execute on function public.web5_stage_inventory(jsonb) to service_role;

create function public.web5_confirm_inventory(p_version uuid,p_effective date,p_note text,p_acknowledge boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare member jsonb; version arles_web_private.inventory_versions%rowtype;
begin
 member:=arles_web_private.require_member();
 if p_effective is null or p_effective<date '1900-01-01' or p_effective>(now() at time zone 'America/Bogota')::date
  or p_acknowledge is distinct from true or length(btrim(coalesce(p_note,''))) not between 10 and 1000
  then raise exception using errcode='22023',message='INVALID_FILTER'; end if;
 perform pg_advisory_xact_lock(281930);
 select * into version from arles_web_private.inventory_versions where id=p_version for update;
 if version.id is null then raise exception using errcode='22023',message='INVALID_FILTER'; end if;
 if version.effective_date is not null then
  if version.effective_date=p_effective then return jsonb_build_object('status','ALREADY_CONFIRMED'); end if;
  raise exception using errcode='22023',message='VERSION_IMMUTABLE';
 end if;
 if exists(select 1 from arles_web_private.inventory_versions where effective_date=p_effective) then
  raise exception using errcode='22023',message='EFFECTIVE_DATE_EXISTS'; end if;
 update arles_web_private.inventory_versions set effective_date=p_effective,confirmed_at=now(),
  confirmed_by=auth.uid(),confirmation_note=btrim(p_note) where id=p_version;
 return jsonb_build_object('status','CONFIRMED');
end;
$$;
revoke all on function public.web5_confirm_inventory(uuid,date,text,boolean) from public,anon;
grant execute on function public.web5_confirm_inventory(uuid,date,text,boolean) to authenticated;

create function public.web5_inventory(p_version uuid default null,p_as_of date default null,
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
  'warnings',version.payload->'warnings','sourceTotals',version.payload->'sourceTotals','reconciliation',version.payload->'reconciliation'),
  'comparison',comparison,'total',total,'rows',rows_result);
end;
$$;
revoke all on function public.web5_inventory(uuid,date,integer,text,text) from public,anon;
grant execute on function public.web5_inventory(uuid,date,integer,text,text) to authenticated;
commit;
