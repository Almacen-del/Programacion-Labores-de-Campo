-- Gantt de ejecución: solo lectura, sin planificación ni porcentajes inferidos.
begin;
create index web4_gantt_date_group on arles_web_private.records(work_date,lot,labor)
  where validation_state<>'BLOCKED';
create function arles_web_private.web4_check(p_snapshot text,p_from date,p_to date,p_filters jsonb,p_offset integer)
returns void language plpgsql stable security invoker set search_path='' as $$
declare current_hash text;
begin
  perform arles_web_private.require_member();
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>92
    or p_offset is null or p_offset<0 or p_offset>1000000 or jsonb_typeof(p_filters) is distinct from 'object'
    then raise exception using errcode='22023',message='INVALID_FILTER'; end if;
  if exists(select 1 from jsonb_each(p_filters) where key not in
    ('lot','labor','plantingYear','collaborator','input','machinery','sourceSheet','alerts')
    or jsonb_typeof(value)<>'string' or length(value#>>'{}')>250)
    or (p_filters ? 'alerts' and p_filters->>'alerts' not in ('WITH','NONE'))
    then raise exception using errcode='22023',message='INVALID_FILTER'; end if;
  select data->>'snapshotHash' into current_hash from arles_web_private.state where id;
  if current_hash is distinct from p_snapshot then raise exception using errcode='40001',message='SNAPSHOT_CHANGED'; end if;
end;
$$;
create function arles_web_private.web4_filtered(p_filters jsonb)
returns setof arles_web_private.records language sql stable security invoker set search_path='' as $$
  select r.* from arles_web_private.records r where
    not exists(select 1 from jsonb_each_text(p_filters) f where f.key<>'alerts' and r.data->>f.key is distinct from f.value)
    and (not(p_filters?'alerts') or
      case p_filters->>'alerts' when 'WITH' then jsonb_array_length(r.data->'alerts')>0
      when 'NONE' then jsonb_array_length(r.data->'alerts')=0 else false end);
$$;
revoke all on function arles_web_private.web4_check(text,date,date,jsonb,integer) from public,anon;
revoke all on function arles_web_private.web4_filtered(jsonb) from public,anon;
grant execute on function arles_web_private.web4_check(text,date,date,jsonb,integer),arles_web_private.web4_filtered(jsonb) to authenticated;

create function public.web4_gantt(p_snapshot text,p_from date,p_to date,p_filters jsonb default '{}',p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  perform arles_web_private.web4_check(p_snapshot,p_from,p_to,p_filters,p_offset);
  with all_filtered as materialized(select * from arles_web_private.web4_filtered(p_filters)),
  usable as materialized(select * from all_filtered where work_date between p_from and p_to
    and validation_state<>'BLOCKED' and nullif(btrim(lot),'') is not null and nullif(btrim(labor),'') is not null),
  grouped as (select lot,labor,count(*) records,count(distinct work_date) active_days from usable group by lot,labor),
  page as (select * from grouped order by lot collate "C",labor collate "C" limit 25 offset p_offset),
  cells as (select u.lot,u.labor,u.work_date,count(*) records,bool_or(u.validation_state='OBSERVED') observed
    from usable u join page p on p.lot=u.lot and p.labor=u.labor group by u.lot,u.labor,u.work_date),
  rows as (select p.lot,p.labor,p.records,p.active_days,jsonb_agg(jsonb_build_object(
    'date',c.work_date,'records',c.records,'observed',c.observed) order by c.work_date) days
    from page p join cells c on p.lot=c.lot and p.labor=c.labor group by p.lot,p.labor,p.records,p.active_days)
  select jsonb_build_object('snapshotHash',p_snapshot,'totalGroups',(select count(*) from grouped),
    'rows',coalesce((select jsonb_agg(to_jsonb(rows) order by lot collate "C",labor collate "C") from rows),'[]'),
    'metrics',jsonb_build_object('records',(select count(*) from usable),'lots',(select count(distinct lot) from usable),
      'labors',(select count(distinct labor) from usable),'activeDays',(select count(distinct work_date) from usable),
      'observed',(select count(*) from usable where validation_state='OBSERVED'),
      'excluded',(select count(*) from all_filtered where work_date between p_from and p_to and
        (validation_state='BLOCKED' or nullif(btrim(lot),'') is null or nullif(btrim(labor),'') is null)),
      'undated',(select count(*) from all_filtered where work_date is null))) into result;
  return result;
end;
$$;
create function public.web4_gantt_detail(p_snapshot text,p_day date,p_lot text,p_labor text,p_filters jsonb default '{}',p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  perform arles_web_private.web4_check(p_snapshot,p_day,p_day,p_filters,p_offset);
  if p_lot is null or p_labor is null or length(p_lot)>250 or length(p_labor)>250 then
    raise exception using errcode='22023',message='INVALID_FILTER'; end if;
  with filtered as materialized(select * from arles_web_private.web4_filtered(p_filters)
    where work_date=p_day and lot=p_lot and labor=p_labor and validation_state<>'BLOCKED'),
  page as (select ordinal,(data-'rawValues')||jsonb_build_object('ordinal',ordinal) item from filtered order by ordinal limit 50 offset p_offset)
  select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(item order by ordinal) from page),'[]')) into result;
  return result;
end;
$$;
create function public.web4_gantt_options(p_snapshot text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  perform arles_web_private.web4_check(p_snapshot,current_date,current_date,'{}',0);
  select jsonb_build_object('latest',max(work_date),'earliest',min(work_date),'fields',(
    select jsonb_object_agg(field,items) from (
      select field,jsonb_agg(val order by val collate "C") items from (
        select distinct field,r.data->>field val from arles_web_private.records r cross join
        unnest(array['lot','labor','plantingYear','collaborator','input','machinery','sourceSheet']) field
        where nullif(btrim(r.data->>field),'') is not null
      ) values_list group by field
    ) lists)) into result from arles_web_private.records where validation_state<>'BLOCKED';
  return result;
end;
$$;
revoke all on function public.web4_gantt(text,date,date,jsonb,integer),
  public.web4_gantt_detail(text,date,text,text,jsonb,integer),public.web4_gantt_options(text) from public,anon;
grant execute on function public.web4_gantt(text,date,date,jsonb,integer),
  public.web4_gantt_detail(text,date,text,text,jsonb,integer),public.web4_gantt_options(text) to authenticated;
commit;
