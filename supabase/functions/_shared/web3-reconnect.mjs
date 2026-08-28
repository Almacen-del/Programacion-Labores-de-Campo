import { PROJECT_URL, TEST_EMAIL } from './drive-oauth.mjs';
const origins=new Set(['https://programacion-labores-de-campo.vercel.app','http://127.0.0.1:5173']);
export function createReconnectAuthorizer(serviceKey,fetchImpl=fetch){
  return async request=>{
    const authorization=request.headers.get('authorization')||'';
    if(!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization))return null;
    const response=await fetchImpl(`${PROJECT_URL}/rest/v1/rpc/web3_reconnect_identity`,{
      method:'POST',headers:{apikey:serviceKey,Authorization:authorization,'Content-Type':'application/json'},
      body:'{}',redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok)return null;
    const member=await response.json();
    return member?.role==='TEST_ADMIN'&&member?.email===TEST_EMAIL&&typeof member.uid==='string'?member:null;
  };
}
export function withReconnectCors(handler){
  return async request=>{
    if(!new URL(request.url).pathname.endsWith('/drive-oauth/reconnect'))return handler(request);
    const origin=request.headers.get('origin');
    if(!origins.has(origin))return new Response(null,{status:403});
    const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST',
      'Access-Control-Allow-Headers':'authorization,apikey,content-type','Vary':'Origin','Cache-Control':'no-store'};
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    const response=await handler(request);
    const output=new Headers(response.headers);for(const [key,value] of Object.entries(headers))output.set(key,value);
    return new Response(response.body,{status:response.status,headers:output});
  };
}
