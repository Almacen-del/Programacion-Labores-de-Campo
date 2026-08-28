import test from 'node:test';
import assert from 'node:assert/strict';
import {createReconnectAuthorizer,withReconnectCors} from '../supabase/functions/_shared/web3-reconnect.mjs';
test('WEB3 CORS restringe origen y autoriza JWT mediante RPC, no decodificación local',async()=>{
 const url='https://dziwhbjyvxdbplthpazt.supabase.co/functions/v1/drive-oauth/reconnect';
 let calls=0;const handler=withReconnectCors(async()=>{calls++;return new Response('{}')});
 assert.equal((await handler(new Request(url,{method:'POST',headers:{origin:'https://other.test'}}))).status,403);
 assert.equal(calls,0);
 const response=await handler(new Request(url,{method:'OPTIONS',headers:{origin:'https://programacion-labores-de-campo.vercel.app'}}));
 assert.equal(response.status,204);assert.equal(calls,0);
 const authorize=createReconnectAuthorizer('server-test-key',async(_url,options)=>{
  assert.equal(options.headers.Authorization,'Bearer a.b.c');return Response.json({email:'other@test',role:'TEST_ADMIN',uid:'x'});
 });
 assert.equal(await authorize(new Request(url)),null);
 assert.equal(await authorize(new Request(url,{headers:{authorization:'Bearer a.b.c'}})),null);
});
