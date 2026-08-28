// Solo observa resultados de cron. Nunca invoca /run ni crea temporizadores de sincronización.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYNC_URL } from '../supabase/functions/_shared/master-sync.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(await fs.readFile(path.join(root,'.private/probe-credentials/drive-oauth.json'),'utf8'));
const away=JSON.parse(await fs.readFile(path.join(root,'.private/evidence/master-sync-browser-away.json'),'utf8'));
if(config.projectRef!=='dziwhbjyvxdbplthpazt' || !away.tabs.every(t=>t.url==='about:blank'))throw new Error('Preflight mismatch');
const closedAt=Date.parse(away.at),deadline=Date.now()+11*60*1000;
let lastCount=-1,lastResult=null;
while(Date.now()<deadline) {
  const response=await fetch(SYNC_URL+'/status',{headers:{Authorization:`Bearer ${config.adminSecret}`},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Status unavailable (${response.status})`);
  lastResult=await response.json();
  const completed=(lastResult.runs||[]).filter(run=>{
    if(!run.dispatch_id || !['UPDATED','UNCHANGED'].includes(run.status) || !run.finished_at || Date.parse(run.started_at)<closedAt)return false;
    const dispatch=lastResult.dispatches.find(d=>d.id===run.dispatch_id);
    return dispatch && Date.parse(dispatch.queued_at)>=closedAt && dispatch.status_code===200 && dispatch.timed_out===false &&
      lastResult.cronRuns.some(c=>c.status==='succeeded' && Math.abs(Date.parse(c.start_time)-Date.parse(dispatch.queued_at))<2000);
  });
  if(completed.length!==lastCount){lastCount=completed.length;console.log(JSON.stringify({scheduledCyclesAfterPagesClosed:lastCount,required:2,at:new Date().toISOString()}));}
  if(completed.length>=2){
    const evidence={pass:true,pagesClosedAt:away.at,verifiedAt:new Date().toISOString(),completedRunIds:completed.map(r=>r.id),result:lastResult};
    await fs.writeFile(path.join(root,`.private/evidence/master-sync-scheduled-validation-${Date.now()}.json`),JSON.stringify(evidence,null,2));
    config.adminSecret='';console.log(JSON.stringify({pass:true,cycles:completed.length,snapshotCount:lastResult.storage.snapshotCount,databaseBytes:lastResult.storage.databaseBytes}));process.exit(0);
  }
  await new Promise(resolve=>setTimeout(resolve,30000));
}
await fs.writeFile(path.join(root,`.private/evidence/master-sync-scheduled-timeout-${Date.now()}.json`),JSON.stringify({pass:false,pagesClosedAt:away.at,result:lastResult},null,2));
config.adminSecret='';throw new Error('Two scheduled cycles were not verified before timeout');
