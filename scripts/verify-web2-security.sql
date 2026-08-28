-- Diagnóstico de lectura. No crea usuarios ni modifica datos de producción.
begin;
do $$
begin
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='arles_web_private' and c.relkind='r' and c.relrowsecurity)<>6 then
    raise exception 'RLS_TABLE_COUNT_MISMATCH'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'web2_%' and has_function_privilege('anon',p.oid,'EXECUTE')) then
    raise exception 'ANON_RPC_EXPOSED'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'web2_%' and p.prosecdef) then
    raise exception 'PUBLIC_RPC_BYPASSES_RLS'; end if;
  if has_table_privilege('authenticated','arles_web_private.records','INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated','arles_web_private.members','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'UNEXPECTED_WRITE_OR_MEMBERS_ACCESS'; end if;
  if has_schema_privilege('authenticated','arles_sync_private','USAGE') or has_schema_privilege('anon','arles_web_private','USAGE') then
    raise exception 'PRIVATE_SCHEMA_EXPOSED'; end if;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-ffffffffffff","role":"authenticated","email":"almacen@arlessas.com"}',true);
do $$
begin
  if (select count(*) from arles_web_private.records)<>0 then raise exception 'RLS_LEAK'; end if;
  begin
    perform public.web2_bootstrap();
    raise exception 'UNAPPROVED_USER_ACCEPTED';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
rollback;
select 'PASS' as security,
  (select count(*) from arles_web_private.records) as records,
  (select count(*) from arles_web_private.alerts) as alerts,
  (select count(*) from arles_sync_private.snapshots) as snapshots;
