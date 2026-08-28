import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// PostgreSQL real en memoria; identidades y registros sintéticos, nunca producción.
let db;
const admin='00000000-0000-4000-8000-000000000001';
const engineer='00000000-0000-4000-8000-000000000002';
const stranger='00000000-0000-4000-8000-000000000003';
const hash='a'.repeat(64);
const payload={sheets:[{name:'Prueba',status:'IMPORTED'}],summary:{total:2,valid:1,observed:0,blocked:1,alerts:1},records:[
  {sourceSheet:'Prueba',sourceRow:2,workDate:'2026-08-01',lot:'LOTE TEST A',labor:'Labor prueba',validationState:'VALID',rawValues:['<script>test</script>'],alerts:[]},
  {sourceSheet:'Prueba',sourceRow:3,workDate:null,lot:'LOTE TEST B',labor:'Otra prueba',validationState:'BLOCKED',rawValues:[],alerts:[{severity:'BLOCKING',message:'Fecha requerida',code:'DATE_REQUIRED'}]}
]};
async function identity(id){
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);
  await db.exec(id?'set role authenticated':'set role anon');
}
before(async()=>{
  db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role supabase_auth_admin; create role service_role;
    create schema auth; grant usage on schema auth to authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz);
    create table auth.identities(user_id uuid,provider text,identity_data jsonb);
    create schema arles_sync_private;
    create table arles_sync_private.snapshots(snapshot_hash text primary key,payload text,created_at timestamptz default now(),summary jsonb);
    create table arles_sync_private.control(id boolean primary key,current_snapshot text,last_checked timestamptz,last_success timestamptz,last_error text,source_meta jsonb);
    create table arles_sync_private.runs(id uuid primary key,started_at timestamptz,finished_at timestamptz,status text,error_code text);`);
  for(const [id,email] of [[admin,'almacen@arlessas.com'],[engineer,'dir.siembrasnuevas@arlessas.com'],[stranger,'otra-cuenta@example.test']]){
    await db.query('insert into auth.users values($1,$2,now(),null)',[id,email]);
    await db.query("insert into auth.identities values($1,'google',$2)",[id,JSON.stringify({email,email_verified:true})]);
  }
  await db.query('insert into arles_sync_private.snapshots(snapshot_hash,payload,summary) values($1,$2,$3)',[hash,JSON.stringify(payload),JSON.stringify(payload.summary)]);
  await db.query('insert into arles_sync_private.control values(true,$1,now(),now(),null,$2)',[hash,JSON.stringify({version:'1',modifiedTime:'2026-08-01T00:00:00Z'})]);
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20260828153000_web2_private_app.sql',import.meta.url),'utf8'));
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20260828132000_web1_drive_oauth.sql',import.meta.url),'utf8'));
  await db.exec('alter table arles_sync_private.control add column lease_until timestamptz');
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20260828170000_web3_sync.sql',import.meta.url),'utf8'));
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20260828183000_web4_gantt.sql',import.meta.url),'utf8'));
});
after(async()=>{await db?.close()});

test('WEB4 Gantt y opciones privados, límites y snapshot obligatorio',async()=>{
  await identity(null);await assert.rejects(db.query("select public.web4_gantt($1,'2026-08-01','2026-08-31')",[hash]),/permission denied/);
  await identity(stranger);await assert.rejects(db.query('select public.web4_gantt_options($1)',[hash]),/ACCESS_DENIED/);
  await identity(admin);
  await assert.rejects(db.query("select public.web4_gantt($1,'2026-01-01','2026-08-31')",[hash]),/INVALID_FILTER/);
  await assert.rejects(db.query("select public.web4_gantt('old','2026-08-01','2026-08-31')"),/SNAPSHOT_CHANGED/);
  await assert.rejects(db.query("select public.web4_gantt($1,'2026-08-01','2026-08-31','{\"unknown\":\"x\"}')",[hash]),/INVALID_FILTER/);
  await assert.rejects(db.query("select public.web4_gantt($1,'2026-08-01','2026-08-31','{\"lot\":3}')",[hash]),/INVALID_FILTER/);
});
test('WEB4 excluye bloqueados y sin fecha; conserva procedencia y filtra sin sumar unidades',async()=>{
  await identity(engineer);
  const result=(await db.query("select public.web4_gantt($1,'2026-08-01','2026-08-31') v",[hash])).rows[0].v;
  assert.equal(result.metrics.records,1);assert.equal(result.metrics.undated,1);assert.equal(result.rows[0].days.length,1);
  assert.equal(result.rows[0].days[0].date,'2026-08-01');assert.equal(result.rows[0].records,1);
  const detail=(await db.query("select public.web4_gantt_detail($1,'2026-08-01','LOTE TEST A','Labor prueba') v",[hash])).rows[0].v;
  assert.equal(detail.rows[0].sourceRow,2);assert.equal(detail.rows[0].rawValues,undefined);
  const empty=(await db.query("select public.web4_gantt($1,'2026-08-01','2026-08-31','{\"lot\":\"otro\"}') v",[hash])).rows[0].v;
  assert.equal(empty.metrics.records,0);assert.deepEqual(empty.rows,[]);
  const options=(await db.query('select public.web4_gantt_options($1) v',[hash])).rows[0].v;
  assert.equal(options.latest,'2026-08-01');assert.ok(options.fields.lot.includes('LOTE TEST A'));
});
test('WEB4 días separados, observaciones y paginación no alteran totales',async()=>{
  await db.exec('reset role; begin');
  for(let i=0;i<28;i++){
    const data={...payload.records[0],lot:'L'+i,sourceRow:10+i,workDate:'2026-08-03',collaborator:'Prueba',plantingYear:2025,input:'I',machinery:'M',validationState:'OBSERVED',alerts:[{severity:'WARNING'}]};
    await db.query("insert into arles_web_private.records values($1,$2,'2026-08-03',$3,'Labor prueba','OBSERVED',$4)",[i+10,hash,data.lot,JSON.stringify(data)]);
  }
  await identity(admin);
  const filters=JSON.stringify({collaborator:'Prueba',plantingYear:'2025',input:'I',machinery:'M',sourceSheet:'Prueba',alerts:'WITH'});
  const first=(await db.query("select public.web4_gantt($1,'2026-08-01','2026-08-31',$2) v",[hash,filters])).rows[0].v;
  const next=(await db.query("select public.web4_gantt($1,'2026-08-01','2026-08-31',$2,25) v",[hash,filters])).rows[0].v;
  assert.equal(first.totalGroups,28);assert.equal(first.rows.length,25);assert.equal(next.rows.length,3);
  assert.deepEqual(first.metrics,next.metrics);assert.equal(first.metrics.observed,28);
  assert.equal(first.rows[0].days.length,1);assert.equal(first.rows[0].days[0].observed,true);
  await db.exec('reset role; rollback');
});

test('WEB3 RPC privada y reconexión restringida al titular temporal',async()=>{
  await identity(null);await assert.rejects(db.query('select public.web3_sync_info()'),/permission denied/);
  await identity(stranger);await assert.rejects(db.query('select public.web3_sync_info()'),/ACCESS_DENIED/);
  await identity(engineer);assert.equal((await db.query('select public.web3_sync_info() v')).rows[0].v.connection.canReconnect,false);
  await assert.rejects(db.query('select public.web3_reconnect_identity()'),/ACCESS_DENIED/);
  await identity(admin);assert.equal((await db.query('select public.web3_reconnect_identity() v')).rows[0].v.uid,admin);
  await assert.rejects(db.query('select * from arles_oauth_private.connection'),/permission denied/);
  await assert.rejects(db.query('select * from arles_web_private.changes'),/permission denied/);
});
test('WEB3 comparación respeta desplazamientos, duplicados y correcciones ambiguas',async()=>{
  await db.exec('reset role');
  const a={sourceSheet:'Test',sourceRow:2,recordHash:'a',rawValues:['A']};
  const b={...a,sourceRow:3,recordHash:'b',rawValues:['B']};
  const compare=async(oldRows,newRows)=>(await db.query('select arles_web_private.compare_records($1,$2) v',[
    JSON.stringify({records:oldRows}),JSON.stringify({records:newRows})])).rows[0].v;
  assert.deepEqual(await compare([a,b],[{...b,sourceRow:9},{...a,sourceRow:8}]),{added:0,removed:0,unchanged:2,possibleCorrections:0});
  assert.deepEqual(await compare([a,{...a,sourceRow:3}],[a]),{added:0,removed:1,unchanged:1,possibleCorrections:0});
  assert.deepEqual(await compare([a],[{...a,rawValues:['CORREGIDO']}]),{added:1,removed:1,unchanged:0,possibleCorrections:1});
});
test('WEB3 sustitución de token es CAS y revalida al actor',async()=>{
  await db.exec('reset role; begin');
  const old='a'.repeat(40), fresh='b'.repeat(40);
  await db.query('insert into arles_oauth_private.connection(token_cipher) values($1)',[old]);
  const renew=async(expected,actor)=>(await db.query('select public.web1_drive_oauth_connect_renew($1,$2,$3) ok',[fresh,expected,actor])).rows[0].ok;
  assert.equal(await renew(old,stranger),false);
  assert.equal(await renew('outdated',admin),false);
  assert.equal(await renew(old,admin),true);
  assert.equal(await renew(old,admin),false);
  await db.exec('rollback');
});
test('WEB2 usuario autorizado obtiene resumen real de la proyección',async()=>{
  await identity(admin);
  const {rows}=await db.query('select public.web2_bootstrap() result');
  assert.equal(rows[0].result.member.role,'TEST_ADMIN');
  assert.equal(rows[0].result.master.summary.total,2);
});
test('WEB2 identidad definitiva autorizada en simulación, no suplanta prueba real',async()=>{
  await identity(engineer);
  const {rows}=await db.query('select public.web2_bootstrap() result');
  assert.equal(rows[0].result.member.role,'ENGINEER');
});
test('WEB2 visitante no puede invocar API ni consultar tablas',async()=>{
  await identity(null);
  await assert.rejects(db.query('select public.web2_bootstrap()'),/permission denied/);
  await assert.rejects(db.query('select * from arles_web_private.records'),/permission denied/);
});
test('WEB2 otro usuario autenticado es rechazado en API y obtiene cero filas por RLS',async()=>{
  await identity(stranger);
  await assert.rejects(db.query('select public.web2_bootstrap()'),/ACCESS_DENIED/);
  assert.equal((await db.query('select * from arles_web_private.records')).rows.length,0);
  assert.equal((await db.query('select * from arles_web_private.alerts')).rows.length,0);
  assert.equal((await db.query('select * from arles_web_private.state')).rows.length,0);
});
test('WEB2 usuario permitido no puede escribir datos, membresías ni ejecutar hook',async()=>{
  await identity(admin);
  await assert.rejects(db.query("update arles_web_private.records set lot='x'"),/permission denied/);
  await assert.rejects(db.query('select * from arles_web_private.members'),/permission denied/);
  await assert.rejects(db.query("select public.web2_before_user_created('{}')"),/permission denied/);
  await assert.rejects(db.query('select arles_web_private.refresh_projection()'),/permission denied/);
});
test('WEB2 paginación, filtros, trazabilidad y datos crudos solo en detalle',async()=>{
  await identity(admin);
  const page=(await db.query('select public.web2_records($1,0,1) result',[hash])).rows[0].result;
  assert.equal(page.total,2);assert.equal(page.rows.length,1);assert.equal(page.rows[0].sourceRow,2);
  assert.equal(page.rows[0].rawValues,undefined);
  const detail=(await db.query('select public.web2_record($1,1) result',[hash])).rows[0].result;
  assert.deepEqual(detail.rawValues,['<script>test</script>']);
  const filtered=(await db.query("select public.web2_records($1,0,50,null,null,'LOTE TEST B') result",[hash])).rows[0].result;
  assert.equal(filtered.total,1);assert.equal(filtered.rows[0].validationState,'BLOCKED');
  const dated=(await db.query("select public.web2_records($1,0,50,'2026-08-01','2026-08-01') result",[hash])).rows[0].result;
  assert.equal(dated.total,1);
});
test('WEB2 límites, fechas invertidas y versión obsoleta son rechazados',async()=>{
  await identity(admin);
  await assert.rejects(db.query('select public.web2_records($1,0,101)',[hash]),/INVALID_FILTER/);
  await assert.rejects(db.query('select public.web2_records($1,null,50)',[hash]),/INVALID_FILTER/);
  await assert.rejects(db.query("select public.web2_records($1,0,50,'2026-09-01','2026-08-01')",[hash]),/INVALID_FILTER/);
  await assert.rejects(db.query("select public.web2_records('old')"),/SNAPSHOT_CHANGED/);
  await assert.rejects(db.query("select public.web2_alerts('old')"),/SNAPSHOT_CHANGED/);
});
test('WEB2 alertas, filtros e historial conservan sus relaciones',async()=>{
  await identity(admin);
  const alerts=(await db.query('select public.web2_alerts($1) result',[hash])).rows[0].result;
  assert.equal(alerts.total,1);assert.equal(alerts.rows[0].recordOrdinal,2);
  assert.equal(alerts.rows[0].sourceRow,3);
  const filters=(await db.query('select public.web2_filters() result')).rows[0].result;
  assert.equal(filters.lots.length,2);
  const history=(await db.query('select public.web2_history() result')).rows[0].result;
  assert.equal(history.versions.length,1);
});
test('WEB2 hook bloquea otros correos y proveedor correo aun con dirección permitida',async()=>{
  await db.exec('reset role; set role supabase_auth_admin');
  const hook=async(email,provider)=> (await db.query('select public.web2_before_user_created($1) result',[JSON.stringify({user:{email,app_metadata:{provider}}})])).rows[0].result;
  assert.deepEqual(await hook('ALMACEN@ARLESSAS.COM','google'),{});
  assert.deepEqual(await hook('dir.siembrasnuevas@arlessas.com','google'),{});
  assert.equal((await hook('otra-cuenta@arlessas.com','google')).error.http_code,403);
  assert.equal((await hook('almacen@arlessas.com','email')).error.http_code,403);
});
test('WEB2 correo sin verificar o miembro deshabilitado pierde acceso',async()=>{
  await db.exec('reset role');
  await db.query('update auth.users set email_confirmed_at=null where id=$1',[admin]);
  await identity(admin);await assert.rejects(db.query('select public.web2_bootstrap()'),/ACCESS_DENIED/);
  await db.exec('reset role');await db.query('update auth.users set email_confirmed_at=now() where id=$1',[admin]);
  await db.exec("update arles_web_private.members set active=false where role='TEST_ADMIN'");
  await identity(admin);await assert.rejects(db.query('select public.web2_bootstrap()'),/ACCESS_DENIED/);
  await db.exec("reset role; update arles_web_private.members set active=true where role='TEST_ADMIN'");
});
test('WEB2 un sondeo no reconstruye registros ni añade versiones',async()=>{
  await db.exec('reset role');
  const before=(await db.query('select xmin::text from arles_web_private.records order by ordinal')).rows;
  await db.exec('update arles_sync_private.control set last_checked=now() where id=true');
  assert.deepEqual((await db.query('select xmin::text from arles_web_private.records order by ordinal')).rows,before);
  assert.equal((await db.query('select count(*)::int n from arles_web_private.history')).rows[0].n,1);
});
test('WEB2 error mantiene la versión y snapshot nuevo cambia caché atómicamente',async()=>{
  await db.exec("reset role; update arles_sync_private.control set last_error='GOOGLE_FAILED',last_checked=now()");
  assert.equal((await db.query('select count(*)::int n from arles_web_private.records')).rows[0].n,2);
  const next={...payload,records:[payload.records[0]],summary:{total:1,valid:1,observed:0,blocked:0,alerts:0}};
  await db.query('insert into arles_sync_private.snapshots(snapshot_hash,payload,summary) values($1,$2,$3)',['b'.repeat(64),JSON.stringify(next),JSON.stringify(next.summary)]);
  await db.exec('begin');
  await db.query('update arles_sync_private.control set current_snapshot=$1,last_error=null',['b'.repeat(64)]);
  assert.equal((await db.query('select count(*)::int n from arles_web_private.records')).rows[0].n,1);
  await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int n from arles_web_private.records')).rows[0].n,2);
  assert.equal((await db.query('select count(*)::int n from arles_sync_private.snapshots')).rows[0].n,2);
});
