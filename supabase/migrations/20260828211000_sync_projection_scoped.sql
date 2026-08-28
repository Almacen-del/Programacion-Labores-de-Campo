-- Compatible con safeupdate de la API: reemplazo acotado de caché, no DELETE global.
begin;
create or replace function arles_web_private.refresh_projection()
returns void language plpgsql security definer set search_path='' as $$
declare ctl arles_sync_private.control%rowtype; snap arles_sync_private.snapshots%rowtype;
 previous_hash text; document jsonb;
begin
 select * into ctl from arles_sync_private.control where id=true;
 select data->>'snapshotHash' into previous_hash from arles_web_private.state where id=true;
 select * into snap from arles_sync_private.snapshots where snapshot_hash=ctl.current_snapshot;
 if ctl.current_snapshot is distinct from previous_hash then
  -- Las alertas de esas filas se eliminan mediante su FK ON DELETE CASCADE.
  delete from arles_web_private.records where snapshot_hash is distinct from ctl.current_snapshot;
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
commit;
