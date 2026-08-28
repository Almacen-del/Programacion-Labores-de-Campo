import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSyncHandler, metadataStamp, readDownload, SyncError, SYNC_URL, PARSER_REVISION, MAX_FILE_BYTES } from '../supabase/functions/_shared/master-sync.mjs';
import { MASTER_ID } from '../supabase/functions/_shared/drive-oauth.mjs';
const hash = b => createHash('sha256').update(b).digest('hex');
const syncSecret = 'a'.repeat(64), adminSecret = 'b'.repeat(64);
const parsed = () => ({ sheets: ['Siembras nuevas','Siembra de producción','Plateo mecanico'].map(name => ({name,status:'IMPORTED'})),
  records:[{sourceSheet:'Siembras nuevas',sourceRow:5,validationState:'VALID',rawValues:['PRIVATE_OPERATIONAL']}],
  summary:{total:1,valid:1,observed:0,blocked:0,alerts:0} });
function setup() {
  const ctx = { current:null, snapshots:[], runs:[], lease:false, downloads:0, parses:0, connections:0, metadataCalls:0,
    bytes:new Uint8Array([1,2,3]), fail:null, storeFail:null };
  ctx.meta = { id:MASTER_ID,version:'1',size:'3',modifiedTime:'2026-08-28T13:00:00Z',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  const store = async (operation, args) => {
    if (operation === 'begin') {
      if(ctx.lease) return null; ctx.lease=true;
      const run={ id:crypto.randomUUID(), status:'RUNNING' }; ctx.runs.push(run);
      return {run_id:run.id,current:ctx.current};
    }
    if(operation==='finish') {
      if(ctx.storeFail && args.p_status!=='ERROR') throw new SyncError(ctx.storeFail);
      const run=ctx.runs.find(x=>x.id===args.p_run_id); ctx.lease=false; run.status=args.p_status; run.metrics=args.p_metrics; run.error=args.p_error_code;
      if(args.p_status==='ERROR') return {preserved_snapshot:ctx.current?.snapshot_hash};
      if(args.p_payload) ctx.snapshots.push(JSON.parse(args.p_payload));
      ctx.current={source_stamp:args.p_meta.stamp,file_hash:args.p_file_hash,snapshot_hash:args.p_snapshot_hash,parser_revision:PARSER_REVISION};
      return {snapshotHash:args.p_snapshot_hash,summary:parsed().summary};
    }
    if(operation==='status') return {current:ctx.current};
    if(operation==='schedule') return {scheduled:true};
  };
  const handler=createSyncHandler({syncSecret,adminSecret,store,
    openDrive:async()=>{ctx.connections++; if(ctx.fail==='oauth') throw new SyncError('GOOGLE_ACCESS_FAILED'); return {
      metadata:async()=>{ctx.metadataCalls++; return {...ctx.meta,...(ctx.fail==='changed' && ctx.metadataCalls%2===0 ? {version:'2'} : {})};},
      download:async()=>{ctx.downloads++; return new Response(ctx.bytes);},
    };},
    parse:async()=>{ctx.parses++; if(ctx.fail==='parse') throw new Error('PRIVATE_OPERATIONAL'); if(ctx.pause) await ctx.pause;
      const result=ctx.nextDocument || parsed(); if(ctx.fail==='structure') result.sheets.pop();
      if(ctx.fail==='empty'){result.records=[];result.summary.valid=0;} return result;},
  });
  const call=(route='/run',key=syncSecret,method='POST',body='{}')=>handler(new Request(SYNC_URL+route,{method,headers:{Authorization:`Bearer ${key}`},...(method==='POST'?{body}: {})}));
  return {ctx,call,handler};
}
test('sync: autorización antes de Google/DB; no admite cambiar el archivo por cuerpo o URL',async()=>{
  const s=setup(); assert.equal((await s.call('/run','wrong')).status,401);
  assert.equal((await s.call('/status',syncSecret,'GET')).status,401);
  assert.equal((await s.call('/run',syncSecret,'POST','{"fileId":"other"}')).status,400);
  assert.equal((await s.call('/run?force=true')).status,400);
  assert.equal(s.ctx.connections,0);assert.equal(s.ctx.runs.length,0);
});
test('sync: guarda primer snapshot; misma versión no descarga ni analiza otra vez',async()=>{
  const s=setup(); const first=await s.call(); assert.equal(first.status,200);
  const firstBody=await first.json(); assert.equal(firstBody.status,'UPDATED'); assert.ok(!JSON.stringify(firstBody).includes('PRIVATE_OPERATIONAL'));
  assert.equal(s.ctx.current.snapshot_hash,hash(JSON.stringify(parsed())));
  const second=await (await s.call()).json(); assert.equal(second.status,'UNCHANGED');
  assert.equal(s.ctx.downloads,1); assert.equal(s.ctx.parses,1);assert.equal(s.ctx.snapshots.length,1);
});
test('sync: cambio de metadatos con iguales bytes no reanaliza ni duplica snapshot',async()=>{
  const s=setup();await s.call();s.ctx.meta.version='2';
  assert.equal((await (await s.call()).json()).status,'UNCHANGED');
  assert.equal(s.ctx.downloads,2);assert.equal(s.ctx.parses,1);assert.equal(s.ctx.snapshots.length,1);
});
test('sync: cambio de bytes publica snapshot nuevo conservando anterior',async()=>{
  const s=setup();await s.call();const prior=s.ctx.current;s.ctx.meta.version='2';s.ctx.bytes=new Uint8Array([4,5,6]);
  s.ctx.nextDocument=parsed();s.ctx.nextDocument.records[0].rawValues=['PRIVATE_CHANGED'];
  assert.equal((await (await s.call()).json()).status,'UPDATED');assert.notEqual(s.ctx.current.file_hash,prior.file_hash);
  assert.equal(s.ctx.snapshots.length,2);
});
test('sync: falla OAuth, descarga, estructura, parser o maestro vacío y conserva vigente',async()=>{
  for(const fail of ['oauth','changed','parse','structure','empty']) {
    const s=setup();await s.call();const prior=s.ctx.current;s.ctx.meta.version='3';s.ctx.bytes=new Uint8Array([4,5,6]);
    s.ctx.metadataCalls=0;s.ctx.fail=fail;const result=await s.call();assert.equal(result.status,502,fail);
    assert.strictEqual(s.ctx.current,prior);assert.equal(s.ctx.snapshots.length,1);assert.equal(s.ctx.runs.at(-1).status,'ERROR');
    assert.ok(!(await result.text()).includes('PRIVATE_OPERATIONAL'));
  }
});
test('sync: cuota impide reemplazo de versión; no borra datos',async()=>{
  const s=setup();await s.call();const prior=s.ctx.current;s.ctx.meta.version='2';s.ctx.bytes=new Uint8Array([3,2,1]);s.ctx.storeFail='STORAGE_LIMIT';
  const response=await s.call();assert.equal(response.status,502);assert.equal((await response.json()).error,'STORAGE_LIMIT');
  assert.strictEqual(s.ctx.current,prior);assert.equal(s.ctx.snapshots.length,1);
});
test('sync: ninguna fila elegible publica cero y una corrección posterior reaparece sin duplicarse',async()=>{
  const s=setup();await s.call();s.ctx.meta.version='2';s.ctx.bytes=new Uint8Array([4,5,6]);
  s.ctx.nextDocument={...parsed(),records:[],summary:{total:0,valid:0,observed:0,blocked:0,alerts:0}};
  assert.equal((await s.call()).status,200);assert.equal(s.ctx.snapshots.at(-1).records.length,0);
  s.ctx.meta.version='3';s.ctx.bytes=new Uint8Array([7,8,9]);s.ctx.nextDocument=parsed();
  assert.equal((await s.call()).status,200);assert.equal(s.ctx.snapshots.at(-1).records.length,1);
  const count=s.ctx.snapshots.length;
  assert.equal((await (await s.call()).json()).status,'UNCHANGED');assert.equal(s.ctx.snapshots.length,count);
});
test('sync: evita solapamiento mientras el primer proceso sigue activo',async()=>{
  const s=setup();let release;s.ctx.pause=new Promise(resolve=>release=resolve);
  const first=s.call();while(!s.ctx.parses) await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal((await s.call()).status,409);release();assert.equal((await first).status,200);assert.equal(s.ctx.runs.length,1);
});
test('sync: metadatos inválidos, archivo ajeno o grande se rechazan',()=>{
  const s=setup(); assert.throws(()=>metadataStamp({...s.ctx.meta,id:'other'}),{message:'MASTER_INVALID'});
  assert.throws(()=>metadataStamp({...s.ctx.meta,size:String(MAX_FILE_BYTES+1)}),{message:'FILE_TOO_LARGE'});
  assert.throws(()=>metadataStamp({...s.ctx.meta,trashed:true}),{message:'MASTER_INVALID'});
});
test('sync: lectura limitada verifica tamaño real, no solo encabezado',async()=>{
  await assert.rejects(readDownload(new Response(new Uint8Array(MAX_FILE_BYTES+1),{headers:{'Content-Length':'1'}})),{message:'FILE_TOO_LARGE'});
  await assert.rejects(readDownload(new Response(new Uint8Array())),{message:'DOWNLOAD_INVALID'});
});
test('sync: tamaño/MD5 inconsistentes nunca se publican',async()=>{
  for(const mismatch of ['size','md5']) {
    const s=setup();if(mismatch==='size')s.ctx.meta.size='4';else s.ctx.meta.md5Checksum='0'.repeat(32);
    assert.equal((await s.call()).status,502);assert.equal(s.ctx.snapshots.length,0);assert.equal(s.ctx.parses,0);
  }
});
test('sync: status y programación solo administrador; no expone el secreto',async()=>{
  const s=setup();assert.equal((await s.call('/schedule',syncSecret)).status,401);
  const response=await s.call('/schedule',adminSecret);assert.equal(response.status,200);assert.ok(!(await response.text()).includes(syncSecret));
  assert.equal((await s.call('/status',adminSecret,'GET')).status,200);
});
