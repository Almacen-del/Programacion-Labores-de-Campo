// Reescritura mecánica de definiciones ya auditadas; conserva permisos y firmas.
import fs from 'node:fs/promises';
const dir=new URL('../supabase/migrations/',import.meta.url);
const file=new URL('20260828210000_required_keys.sql',dir);
let target=await fs.readFile(file,'utf8');
const marker='-- Las definiciones de ingesta y consulta actualizadas se agregan a continuación.';
if(!target.includes(marker))throw Error('MISSING_MARKER');
target=target.slice(0,target.indexOf(marker))+marker+'\n-- REQUIRED_KEYS_FUNCTIONS\ncommit;\n';
const oldSync=await fs.readFile(new URL('20260828140000_web1_master_sync.sql',dir),'utf8');
const oldInventory=await fs.readFile(new URL('20260828193000_web5_inventory.sql',dir),'utf8');
const extract=(source,name)=>{const start=source.indexOf('create function public.'+name+'(');const end=source.indexOf('\n$$;',start);if(start<0||end<0)throw Error('FUNCTION_NOT_FOUND');return source.slice(start,end+4).replace('create function','create or replace function')};
const change=(s,a,b)=>{if(!s.includes(a))throw Error('REPLACEMENT_NOT_FOUND');return s.replace(a,()=>b)};
let finish=extract(oldSync,'web1_sync_finish');
finish=change(finish,"jsonb_array_length(document->'records')=0", "false");
finish=change(finish,"    if not exists(select 1 from arles_sync_private.snapshots where snapshot_hash=p_snapshot_hash) then",`    document := arles_sync_private.filter_master(document);
    p_payload := document::text;
    p_snapshot_hash := encode(sha256(convert_to(p_payload,'UTF8')),'hex');
    size_bytes := octet_length(p_payload);
    if size_bytes > 10485760 then raise exception 'SNAPSHOT_TOO_LARGE'; end if;
    if not exists(select 1 from arles_sync_private.snapshots where snapshot_hash=p_snapshot_hash) then`);
let stage=extract(oldInventory,'web5_stage_inventory');
stage=change(stage,'begin\n',`begin
 if p_payload is not null and jsonb_typeof(p_payload->'rows')='array' then
  p_payload:=arles_sync_private.filter_inventory(p_payload);
 end if;
`);
stage=change(stage,'not between 1 and 10000','not between 0 and 10000');
let inventory=extract(oldInventory,'web5_inventory');
inventory=change(inventory,"'warnings',version.payload->'warnings','sourceTotals',version.payload->'sourceTotals','reconciliation',version.payload->'reconciliation'",
 "'warnings',version.payload->'warnings','includedTotals',version.payload->'includedTotals',\n  'sourceTotals',version.payload->'includedTotals','reconciliation','[]'::jsonb");
await fs.writeFile(file,target.replace('-- REQUIRED_KEYS_FUNCTIONS',()=>[finish,stage,inventory].join('\n\n')));
