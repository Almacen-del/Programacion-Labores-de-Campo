-- Solo lectura. No simula la identidad del ingeniero ni modifica cuentas.
select jsonb_build_object(
 'members',(select jsonb_agg(jsonb_build_object('email',m.email,'role',m.role,'active',m.active,
  'registered',u.id is not null,'lastSignIn',u.last_sign_in_at) order by m.email)
  from arles_web_private.members m left join auth.users u on lower(u.email)=m.email),
 'inventory',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'effectiveDate',effective_date,
  'confirmedAt',confirmed_at,'rows',payload->'summary'->'rows','review',payload->'summary'->'review')),'[]')
  from arles_web_private.inventory_versions),
 'invalidCurrentRows',(select count(*) from arles_web_private.records where not arles_sync_private.has_required_keys(data)),
 'invalidHistoricalRows',(select count(*) from arles_sync_private.snapshots s cross join lateral
  jsonb_array_elements(s.payload::jsonb->'records') r where not arles_sync_private.has_required_keys(r)),
 'invalidInventoryRows',(select count(*) from arles_web_private.inventory_versions v cross join lateral
  jsonb_array_elements(v.payload->'rows') r where not arles_sync_private.has_required_keys(r))
) as acceptance_preflight;
