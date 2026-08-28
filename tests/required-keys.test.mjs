import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {applyInventoryPolicy} from '../src/importer/inventory-policy.mjs';
const read=name=>fs.readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const hash=text=>createHash('sha256').update(text).digest('hex');
test('regla persistente: limpia históricos y totales, reincorpora correcciones, quita claves y no duplica',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create role supabase_auth_admin;
   create schema auth;create function auth.uid() returns uuid language sql as $$select null::uuid$$;
   create table auth.users(id uuid,email text,email_confirmed_at timestamptz,banned_until timestamptz);
   create table auth.identities(user_id uuid,provider text,identity_data jsonb);`);
  let sync=await read('20260828140000_web1_master_sync.sql');
  sync=sync.slice(0,sync.indexOf('-- Solo el trabajo cron')).replaceAll(/create extension if not exists \w+;/g,'');
  await db.exec(sync+'commit;');
  const r={lot:'L1',plantingYear:2020,sourceSheet:'Test',sourceRow:2,workDate:'2026-08-01',labor:'Labor',validationState:'VALID',alerts:[],rawValues:['original']};
  const rows=[r,{...r,plantingYear:null,sourceRow:3},{...r,lot:' \t ',sourceRow:4},{...r,lot:null,plantingYear:null,sourceRow:5}];
  const doc=rs=>({sheets:[{name:'Test',status:'IMPORTED',importedRowCount:rs.length}],records:rs,summary:{total:rs.length,valid:rs.length,observed:0,blocked:0,alerts:0}});
  const original=JSON.stringify(doc(rows));
  await db.query("insert into arles_sync_private.snapshots values($1,$2,'ma-f-009-v1',$3,$4,$5,now())",[hash(original),'f'.repeat(64),original,Buffer.byteLength(original),doc(rows).summary]);
  await db.query('update arles_sync_private.control set current_snapshot=$1',[hash(original)]);
  for(const name of ['20260828153000_web2_private_app.sql','20260828132000_web1_drive_oauth.sql','20260828170000_web3_sync.sql','20260828183000_web4_gantt.sql','20260828193000_web5_inventory.sql'])await db.exec(await read(name));
  const inventory={schema:'arles-inventory-v1',fileHash:'e'.repeat(64),warnings:['El total de planted no coincide'],sourceTotals:{planted:999},totalsRows:[[999]],formulas:{G2:'kept',G3:'removed'},rows:[
   {ordinal:1,lot:'L1',plantingYear:2020,sourceSheet:'Test',sourceRow:2,rawValues:[],issues:[],state:'VALID',trees:10,totalAlive:null,formulas:{G2:'kept'}},
   {ordinal:2,lot:'L2',plantingYear:null,sourceSheet:'Test',sourceRow:3,rawValues:[],issues:[],state:'VALID',trees:999,formulas:{G3:'removed'}}]};
  const inv=(await db.query('select public.web5_stage_inventory($1) v',[inventory])).rows[0].v;
  await db.exec(await read('20260828210000_required_keys.sql'));
  const scoped=await read('20260828211000_sync_projection_scoped.sql');
  assert.match(scoped,/delete from arles_web_private.records where snapshot_hash is distinct from ctl.current_snapshot;/);
  await db.exec(scoped);
  let snapshot=(await db.query('select payload,summary from arles_sync_private.snapshots')).rows;
  assert.equal(snapshot.length,1);assert.equal(snapshot[0].summary.total,1);
  assert.deepEqual(JSON.parse(snapshot[0].payload).records,[r]);
  assert.equal((await db.query('select count(*)::int n from arles_web_private.records')).rows[0].n,1);
  assert.equal((await db.query('select summary from arles_web_private.history')).rows[0].summary.total,1);
  const storedInv=(await db.query('select payload from arles_web_private.inventory_versions where id=$1',[inv.id])).rows[0].payload;
  assert.deepEqual(storedInv,applyInventoryPolicy(inventory));
  assert.equal(storedInv.includedTotals.planted,10);assert.equal(storedInv.includedTotals.totalAlive,null);
  assert.equal(storedInv.totalsRows,undefined);assert.deepEqual(storedInv.formulas,{G2:'kept'});
  const ingest=async rs=>{
   const lease=(await db.query('select public.web1_sync_begin() v')).rows[0].v;
   const text=JSON.stringify(doc(rs));
   return (await db.query("select public.web1_sync_finish($1,'UPDATED',$2,$3,$4,$5,'{}',null) v",[lease.run_id,{stamp:'synthetic'},'f'.repeat(64),hash(text),text])).rows[0].v;
  };
  const corrected=[r,{...rows[1],plantingYear:2021},rows[2],rows[3]];
  assert.equal((await ingest(corrected)).summary.total,2);
  assert.equal((await db.query('select count(*)::int n from arles_web_private.records')).rows[0].n,2);
  const count=(await db.query('select count(*)::int n from arles_sync_private.snapshots')).rows[0].n;
  await ingest(corrected);assert.equal((await db.query('select count(*)::int n from arles_sync_private.snapshots')).rows[0].n,count);
  assert.equal((await ingest(rows)).summary.total,1);
  assert.equal((await ingest(rows.map(x=>({...x,lot:null})))).summary.total,0);
  assert.equal((await db.query('select count(*)::int n from arles_web_private.records')).rows[0].n,0);
  assert.equal((await ingest(corrected)).summary.total,2);
  const newInv=await db.query('select public.web5_stage_inventory($1) v',[{...inventory,fileHash:'d'.repeat(64),rows:inventory.rows.map(r=>({...r,lot:null}))}]);
  assert.equal((await db.query('select payload from arles_web_private.inventory_versions where id=$1',[newInv.rows[0].v.id])).rows[0].payload.summary.rows,0);
  await db.exec('set role anon');
  await assert.rejects(db.query('select arles_sync_private.filter_master($1)',[doc(rows)]),/permission denied/);
 } finally {await db.close()}
});
