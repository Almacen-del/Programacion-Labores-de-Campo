// Solo clave PUBLICABLE. No usa credenciales de servidor ni crea usuarios.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const config=JSON.parse(await fs.readFile(new URL('../.private/probe-credentials/web2-public.json',import.meta.url),'utf8'));
assert.equal(config.url,'https://dziwhbjyvxdbplthpazt.supabase.co');
assert.match(config.publishableKey,/^sb_publishable_/);
const headers={apikey:config.publishableKey,'Content-Type':'application/json'};
const evidence=[];
for(const [name,args] of [['web2_bootstrap',{}],['web2_records',{p_snapshot:null}],['web2_history',{}],['web2_before_user_created',{event:{}}]]){
  const response=await fetch(config.url+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(20000)});
  assert.ok([401,403,404].includes(response.status),`${name} allowed anonymous access (${response.status})`);
  evidence.push({test:name,anonymousStatus:response.status});
}
const forged=await fetch(config.url+'/rest/v1/rpc/web2_bootstrap',{method:'POST',headers:{...headers,Authorization:'Bearer not-a-valid-jwt'},body:'{}',redirect:'error',signal:AbortSignal.timeout(20000)});
assert.equal(forged.status,401);evidence.push({test:'invalid-jwt',status:forged.status});
const response=await fetch(config.url+'/auth/v1/settings',{headers,redirect:'error',signal:AbortSignal.timeout(20000)});
assert.equal(response.status,200);
const settings=await response.json();
assert.equal(settings.external.google,true);
assert.equal(settings.external.email,false);
assert.equal(settings.external.anonymous_users??false,false);
evidence.push({test:'auth-providers',google:true,email:false,anonymous:false});
await fs.writeFile(new URL(`../.private/evidence/web2-public-gates-${Date.now()}.json`,import.meta.url),JSON.stringify({at:new Date().toISOString(),checks:evidence},null,2));
console.log(JSON.stringify({pass:true,checks:evidence}));
