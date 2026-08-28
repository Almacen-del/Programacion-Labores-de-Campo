import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {PGlite} from '@electric-sql/pglite';
import {createHash} from 'node:crypto';
import {prepareOfflineDatabase,validateBackup,verifyOfflineRecovery} from '../scripts/lib/backup.mjs';
await build({entryPoints:['src/web/export-model.ts'],outfile:'dist/export-test.mjs',bundle:true,platform:'node',format:'esm'});
const {csvCell,reportCsv,backupEnvelope}=await import('../dist/export-test.mjs');
test('CSV seguro, comillas, Unicode y Gantt sin rellenar huecos',()=>{
 assert.equal(csvCell('=SUM(A1)'),"\"'=SUM(A1)\"");assert.equal(csvCell(' \t@x'),"\"' \t@x\"");
 assert.equal(csvCell('á;"b"'),'"á;""b"""');
 const csv=reportCsv({kind:'gantt',from:'2026-08-01',to:'2026-08-03',snapshotHash:'abc',rows:[{lot:'L1',labor:'Plateo',date:'2026-08-01',records:2},{lot:'L1',labor:'Plateo',date:'2026-08-03',records:1}]});
 assert.match(csv,/"2";"";"1"/);assert.equal(csv.split('\r\n').length,3);
});
test('WEB6 permisos, filtros completos, respaldo sin credenciales y recuperación aislada',async()=>{
 const db=new PGlite();let envelope;
 try{
  await prepareOfflineDatabase(db);
  const id='00000000-0000-4000-8000-000000000001';
  await db.query("insert into auth.users values($1,'almacen@arlessas.com',now(),null)",[id]);
  await db.query("insert into auth.identities values($1,'google','{\"email\":\"almacen@arlessas.com\",\"email_verified\":true}')",[id]);
  const rows=Array.from({length:61},(_,i)=>({lot:'L1',plantingYear:2020,sourceSheet:'Test',sourceRow:i+2,workDate:'2026-08-01',labor:'Plateo',collaborator:'Prueba',validationState:i===60?'BLOCKED':'VALID',alerts:[],rawValues:['=UNTRUSTED']}));
  const p=JSON.stringify({sheets:[{name:'Test',importedRowCount:61}],records:rows,summary:{total:61,valid:60,blocked:1,observed:0,alerts:0}}),hash=createHash('sha256').update(p).digest('hex');
  await db.query("insert into arles_sync_private.snapshots values($1,$2,'ma-f-009-v1',$3,$4,$5,now())",[hash,'f'.repeat(64),p,Buffer.byteLength(p),JSON.parse(p).summary]);
  await db.query('update arles_sync_private.control set current_snapshot=$1,file_hash=$2 where id',[hash,'f'.repeat(64)]);
  await db.query("insert into arles_oauth_private.connection(token_cipher) values('DO_NOT_EXPORT_THIS_ENCRYPTED_CREDENTIAL_1234567890')");
  const inv=(await db.query('select public.web5_stage_inventory($1) v',[{schema:'arles-inventory-v1',fileHash:'e'.repeat(64),rows:[{ordinal:1,sourceRow:9,sourceSheet:'Test',lot:'L1',plantingYear:2020,state:'VALID',issues:[],rawValues:[null,10],trees:10,totalAlive:null,formulas:{}}],warnings:[]}])).rows[0].v;
  await db.exec('set role anon');
  for(const fn of ['web6_capacity()','web6_backup()',"web6_export(null,null,null)"])await assert.rejects(db.query('select public.'+fn),/permission denied/);
  await db.exec('set role authenticated');await assert.rejects(db.query('select public.web6_backup()'),/ACCESS_DENIED/);
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');
  await db.query("select public.web5_confirm_inventory($1,'2025-01-01','Confirmación sintética para recuperación',true)",[inv.id]);
  const control=(await db.query("select public.web6_export($1,'2026-08-01','2026-08-03','{}','control') v",[hash])).rows[0].v;
  assert.equal(control.rows.length,61);assert.equal(control.rows[0].rawValues,undefined);
  const gantt=(await db.query("select public.web6_export($1,'2026-08-01','2026-08-03','{}','gantt') v",[hash])).rows[0].v;
  assert.equal(gantt.totalRecords,60);assert.equal(gantt.rows[0].records,60);
  assert.equal((await db.query("select public.web6_export($1,'2026-08-01','2026-08-03','{\"lot\":\"L2\"}') v",[hash])).rows[0].v.totalRecords,0);
  await assert.rejects(db.query("select public.web6_export('old','2026-08-01','2026-08-03')"),/SNAPSHOT_CHANGED/);
  await assert.rejects(db.query("select public.web6_export($1,'2026-01-01','2026-08-03')",[hash]),/INVALID_FILTER/);
  const backup=(await db.query('select public.web6_backup() v')).rows[0].v;
  assert.ok(!JSON.stringify(backup).includes('DO_NOT_EXPORT'));assert.ok(!('token_cipher' in backup));
  const cap=(await db.query('select public.web6_capacity() v')).rows[0].v;
  assert.equal(cap.snapshotCount,1);assert.equal(cap.providerTransferBytes,null);assert.equal(cap.automaticDeletion,false);
  envelope=await backupEnvelope(backup);assert.equal(validateBackup(envelope).snapshots.length,1);
  assert.throws(()=>validateBackup(envelope.replace('arles-backup-v1','tampered')));
 }finally{await db.close()}
 const recovered=await verifyOfflineRecovery(envelope);assert.equal(recovered.records,61);assert.equal(recovered.inventory_versions,1);assert.equal(recovered.productionModified,false);
});
