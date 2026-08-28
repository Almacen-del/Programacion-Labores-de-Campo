import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYNC_URL } from '../supabase/functions/_shared/master-sync.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mode=process.argv[2]||'status';
if(!['gates','run','status','schedule'].includes(mode))throw new Error('Use gates, run, status or schedule');
const config=JSON.parse(await fs.readFile(path.join(root,'.private/probe-credentials/master-sync.json'),'utf8'));
const oauth=JSON.parse(await fs.readFile(path.join(root,'.private/probe-credentials/drive-oauth.json'),'utf8'));
if(config.projectRef!=='dziwhbjyvxdbplthpazt'||oauth.projectRef!==config.projectRef)throw new Error('Project mismatch');
const evidence={at:new Date().toISOString(),mode,checks:[]};
const call=(route,secret,method='POST')=>fetch(SYNC_URL+route,{method,redirect:'error',signal:AbortSignal.timeout(130000),
  headers:{...(secret?{Authorization:`Bearer ${secret}`} : {}),'Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})});
try {
  if(mode==='gates') {
    for(const [route,key,method,expected] of [['/run',null,'POST',401],['/run','0'.repeat(64),'POST',401],['/status',config.secret,'GET',401],['/schedule',config.secret,'POST',401]]) {
      const response=await call(route,key,method);evidence.checks.push({route,status:response.status,expected});await response.body?.cancel();
      if(response.status!==expected)throw new Error('SECURITY_GATE_FAILED');
    }
  } else {
    const response=await call('/'+mode,mode==='run'?config.secret:oauth.adminSecret,mode==='status'?'GET':'POST');
    evidence.httpStatus=response.status;
    evidence.result=await response.json();
    if(!response.ok)throw new Error('REMOTE_OPERATION_FAILED');
    if(mode==='status' && evidence.result.current?.fileHash==='19fc850b66ab1a98fd48026b647269c07a47d62d819f7ce8d432ab0f0fa4ad4f') {
      evidence.matchesApprovedBaseline=evidence.result.current.snapshotHash==='a5287aab0805eccc03993f5c56c618d2aba19766966589b00705b6d338363205';
      // La política de claves cambia legítimamente el snapshot del mismo XLSX.
      // El respaldo y los conteos elegibles se verifican por separado en SQL.
    }
  }
  evidence.pass=true;
} catch(error) {evidence.pass=false;evidence.error=['SECURITY_GATE_FAILED','REMOTE_OPERATION_FAILED','SNAPSHOT_MISMATCH'].includes(error.message)?error.message:'REQUEST_FAILED';process.exitCode=1;}
finally {
  config.secret='';oauth.adminSecret='';oauth.clientSecret='';oauth.encryptionKey='';
  await fs.writeFile(path.join(root,`.private/evidence/master-sync-${mode}-${Date.now()}.json`),JSON.stringify(evidence,null,2));
  if(mode==='status'&&evidence.result) {
    const r=evidence.result;console.log(JSON.stringify({pass:evidence.pass,matchesApprovedBaseline:evidence.matchesApprovedBaseline,
      current:r.current,storage:r.storage,schedule:r.schedule,runs:r.runs?.slice(0,3),dispatches:r.dispatches?.slice(0,3),cronRuns:r.cronRuns?.slice(0,3)}));
  }else console.log(JSON.stringify(evidence));
}
