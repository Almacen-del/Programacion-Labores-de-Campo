-- WEB 6, bloque consultable: no purga historial, no cambia planes ni credenciales.
begin;
create function public.web6_export(p_snapshot text,p_from date,p_to date,p_filters jsonb default '{}',p_kind text default 'control')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; total integer;
begin
 perform arles_web_private.web4_check(p_snapshot,p_from,p_to,p_filters,0);
 if p_kind is null or p_kind not in ('control','gantt') then raise exception using errcode='22023',message='INVALID_FILTER'; end if;
 select count(*) into total from arles_web_private.web4_filtered(p_filters)
  where work_date between p_from and p_to and (p_kind='control' or (validation_state<>'BLOCKED' and nullif(btrim(labor),'') is not null));
 if total>20000 then raise exception using errcode='54000',message='EXPORT_LIMIT'; end if;
 if p_kind='control' then
  select coalesce(jsonb_agg(data-'rawValues' order by work_date,ordinal),'[]') into result
   from arles_web_private.web4_filtered(p_filters) where work_date between p_from and p_to;
 else
  select coalesce(jsonb_agg(to_jsonb(t) order by lot collate "C",labor collate "C",date),'[]') into result from (
   select lot,labor,work_date date,count(*) records,bool_or(validation_state='OBSERVED') observed
   from arles_web_private.web4_filtered(p_filters) where work_date between p_from and p_to
    and validation_state<>'BLOCKED' and nullif(btrim(labor),'') is not null group by lot,labor,work_date
  ) t;
 end if;
 return jsonb_build_object('kind',p_kind,'snapshotHash',p_snapshot,'from',p_from,'to',p_to,'filters',p_filters,
  'generatedAt',now(),'totalRecords',total,'rows',result);
end;
$$;
revoke all on function public.web6_export(text,date,date,jsonb,text) from public,anon;
grant execute on function public.web6_export(text,date,date,jsonb,text) to authenticated;

create function public.web6_capacity()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform arles_web_private.require_member();
 select jsonb_build_object('checkedAt',now(),'databaseBytes',pg_database_size(current_database()),
  'snapshotCount',(select count(*) from arles_sync_private.snapshots),
  'snapshotBytes',(select coalesce(sum(json_bytes),0) from arles_sync_private.snapshots),
  'inventoryVersions',(select count(*) from arles_web_private.inventory_versions),
  'inventoryBytes',(select coalesce(sum(octet_length(payload::text)),0) from arles_web_private.inventory_versions),
  'syncRunsMonth',count(*),'syncErrorsMonth',count(*) filter(where status='ERROR'),
  'downloadedBytesMonth',coalesce(sum((metrics->>'downloadedBytes')::bigint),0),
  'snapshotSentBytesMonth',coalesce(sum((metrics->>'snapshotJsonBytes')::bigint),0),
  'guards',jsonb_build_object('databaseBytes',419430400,'snapshotCount',100,'snapshotBytes',104857600),
  'automaticDeletion',false,'providerTransferBytes',null,'providerInvocations',null) into result
 from arles_sync_private.runs where started_at>=date_trunc('month',now() at time zone 'America/Bogota') at time zone 'America/Bogota';
 return result;
end;
$$;
revoke all on function public.web6_capacity() from public,anon;
grant execute on function public.web6_capacity() to authenticated;

create function public.web6_backup()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform arles_web_private.require_member();
 -- Respuesta única y consistente; nunca un respaldo truncado ni credenciales.
 if (select coalesce(sum(json_bytes),0) from arles_sync_private.snapshots)+
  (select coalesce(sum(octet_length(payload::text)),0) from arles_web_private.inventory_versions)>25165824
  then raise exception using errcode='54000',message='BACKUP_LIMIT'; end if;
 select jsonb_build_object('schema','arles-backup-v1','projectRef','dziwhbjyvxdbplthpazt','exportedAt',now(),
  'configuration',jsonb_build_object('inclusionRule','lot-planting-year-v1','syncIntervalMinutes',5,
   'plansImplemented',false,'retentionApproved',false),
  'members',(select jsonb_agg(jsonb_build_object('email',email,'role',role,'active',active) order by email) from arles_web_private.members),
  'master',(select jsonb_build_object('currentSnapshot',current_snapshot,'fileHash',file_hash,
   'sourceMeta',source_meta,'lastSuccess',last_success) from arles_sync_private.control where id),
  'snapshots',(select coalesce(jsonb_agg(jsonb_build_object('snapshotHash',snapshot_hash,'fileHash',file_hash,
   'parserRevision',parser_revision,'createdAt',created_at,'payload',payload) order by created_at,snapshot_hash),'[]') from arles_sync_private.snapshots),
  'inventories',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'fileHash',file_hash,'createdAt',created_at,
   'effectiveDate',effective_date,'confirmedAt',confirmed_at,'confirmationNote',confirmation_note,'payload',payload) order by created_at,id),'[]') from arles_web_private.inventory_versions),
  'exclusions',jsonb_build_array('OAuth y credenciales','Usuarios y sesiones de Auth','Logs de ejecución','Archivos Excel originales')) into result;
 if octet_length(result::text)>33554432 then raise exception using errcode='54000',message='BACKUP_LIMIT'; end if;
 return result;
end;
$$;
revoke all on function public.web6_backup() from public,anon;
grant execute on function public.web6_backup() to authenticated;
commit;
