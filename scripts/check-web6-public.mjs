import fs from 'node:fs/promises';
const config=JSON.parse(await fs.readFile(new URL('../.private/probe-credentials/web2-public.json',import.meta.url),'utf8'));
if(config.url!=='https://dziwhbjyvxdbplthpazt.supabase.co'||!config.publishableKey?.startsWith('sb_publishable_'))throw Error('PROJECT_MISMATCH');
const results=[];
for(const name of ['web6_backup','web6_capacity','web6_export']){
 const r=await fetch(config.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(name==='web6_export'?{p_snapshot:null,p_from:null,p_to:null}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});
 await r.body?.cancel();if(![401,403,404].includes(r.status))throw Error('ANONYMOUS_ACCESS_GATE_FAILED');results.push({name,status:r.status});
}
console.log(JSON.stringify({pass:true,anonymous:results}));
