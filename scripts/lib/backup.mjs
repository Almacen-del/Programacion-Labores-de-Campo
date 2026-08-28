import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {isDeepStrictEqual} from 'node:util';
const sha=s=>createHash('sha256').update(s).digest('hex');
const ensure=(condition)=>{if(!condition)throw Error('INVALID_BACKUP')};
export function validateBackup(text){
 ensure(Buffer.byteLength(text)<=70*1048576);
 const e=JSON.parse(text);ensure(e.format==='arles-backup-envelope-v1'&&typeof e.payload==='string'&&Buffer.byteLength(e.payload)<=32*1048576&&sha(e.payload)===e.sha256);
 const b=JSON.parse(e.payload);ensure(b.schema==='arles-backup-v1'&&b.projectRef==='dziwhbjyvxdbplthpazt');
 ensure(b.configuration?.inclusionRule==='lot-planting-year-v1'&&b.configuration.plansImplemented===false);
 ensure(Array.isArray(b.snapshots)&&Array.isArray(b.inventories)&&Array.isArray(b.members));
 ensure(b.snapshots.length<=100&&b.inventories.length<=100);
 const hashes=new Set();
 for(const s of b.snapshots){
  ensure(typeof s.payload==='string'&&sha(s.payload)===s.snapshotHash&&!hashes.has(s.snapshotHash));hashes.add(s.snapshotHash);
  const p=JSON.parse(s.payload);ensure(Array.isArray(p.records)&&p.summary.total===p.records.length);
  ensure(p.records.every(r=>typeof r.lot==='string'&&r.lot.trim()&&Number.isInteger(r.plantingYear)));
 }
 ensure(b.master?.currentSnapshot===null||hashes.has(b.master?.currentSnapshot));
 ensure(b.members.every(m=>['almacen@arlessas.com','dir.siembrasnuevas@arlessas.com'].includes(m.email)&&['TEST_ADMIN','ENGINEER'].includes(m.role)&&typeof m.active==='boolean'));
 for(const i of b.inventories)ensure(i.payload?.fileHash===i.fileHash&&Array.isArray(i.payload.rows)&&i.payload.rows.every(r=>typeof r.lot==='string'&&r.lot.trim()&&Number.isInteger(r.plantingYear)));
 return b;
}
export async function prepareOfflineDatabase(db){
 // Únicamente PGlite aislado. Sin URL, claves, cron ni conexiones externas.
 await db.exec(`create role anon;create role authenticated;create role service_role;create role supabase_auth_admin;
 create schema auth;grant usage on schema auth to authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid,email text,email_confirmed_at timestamptz,banned_until timestamptz);
 create table auth.identities(user_id uuid,provider text,identity_data jsonb);`);
 const dir=new URL('../../supabase/migrations/',import.meta.url);
 let sync=await fs.readFile(new URL('20260828140000_web1_master_sync.sql',dir),'utf8');
 sync=sync.slice(0,sync.indexOf('-- Solo el trabajo cron')).replaceAll(/create extension if not exists \w+;/g,'');
 await db.exec(sync+'commit;');
 for(const name of ['20260828153000_web2_private_app.sql','20260828132000_web1_drive_oauth.sql','20260828170000_web3_sync.sql','20260828183000_web4_gantt.sql','20260828193000_web5_inventory.sql','20260828210000_required_keys.sql','20260828211000_sync_projection_scoped.sql','20260828220000_web6_reports_backup.sql'])await db.exec(await fs.readFile(new URL(name,dir),'utf8'));
}
export async function verifyOfflineRecovery(text){
 const b=validateBackup(text),db=new PGlite();
 try{
  await prepareOfflineDatabase(db);
  await db.exec('begin');
  for(const s of b.snapshots)await db.query('insert into arles_sync_private.snapshots(snapshot_hash,file_hash,parser_revision,payload,json_bytes,summary,created_at) values($1,$2,$3,$4,$5,$6,$7)',[s.snapshotHash,s.fileHash,s.parserRevision,s.payload,Buffer.byteLength(s.payload),JSON.parse(s.payload).summary,s.createdAt]);
  for(const i of b.inventories)await db.query('insert into arles_web_private.inventory_versions(id,file_hash,created_at,effective_date,confirmed_at,confirmation_note,payload) values($1,$2,$3,$4,$5,$6,$7)',[i.id,i.fileHash,i.createdAt,i.effectiveDate,i.confirmedAt,i.confirmationNote,i.payload]);
  for(const m of b.members)await db.query('update arles_web_private.members set role=$2,active=$3 where email=$1',[m.email,m.role,m.active]);
  await db.query('update arles_sync_private.control set current_snapshot=$1,file_hash=$2,source_meta=$3,last_success=$4 where id=true',[b.master.currentSnapshot,b.master.fileHash,b.master.sourceMeta,b.master.lastSuccess]);
  await db.exec('commit');
  const n=(await db.query('select (select count(*)::int from arles_sync_private.snapshots) snapshots,(select count(*)::int from arles_web_private.records) records,(select count(*)::int from arles_web_private.inventory_versions) inventory_versions,(select count(*)::int from arles_web_private.alerts) alerts')).rows[0];
  const current=b.snapshots.find(s=>s.snapshotHash===b.master.currentSnapshot);
  ensure(n.records===(current?JSON.parse(current.payload).summary.total:0));
  const restored=(await db.query('select id,payload,effective_date::text,confirmation_note from arles_web_private.inventory_versions order by id')).rows;
  ensure(restored.length===b.inventories.length&&restored.every(r=>b.inventories.some(i=>i.id===r.id&&isDeepStrictEqual(i.payload,r.payload)&&i.effectiveDate===r.effective_date&&i.confirmationNote===r.confirmation_note)));
  return {pass:true,mode:'isolated-pglite',...n,credentialsRestored:false,productionModified:false};
 }finally{await db.close()}
}
