import test from 'node:test';
import assert from 'node:assert/strict';
import { createDriveOAuthHandler, createCipher, createRpcStore, digest, randomHex,
  BASE_URL, MASTER_ID, TEST_EMAIL, DRIVE_SCOPE } from '../supabase/functions/_shared/drive-oauth.mjs';

const clientId = '433631251791-test.apps.googleusercontent.com';
function setup(overrides = {}, authorizeReconnect=async()=>null) {
  const states = new Map();
  const context = { record: null, calls: [], refreshes: 0 };
  const adminSecret = 'a'.repeat(64), encryptionKey = 'b'.repeat(64);
  const google = {
    async authorizationUrl(state, verifier) { context.verifier = verifier; return `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`; },
    async exchange() { context.calls.push('exchange'); return { access_token: 'ACCESS_PRIVATE', refresh_token: 'REFRESH_PRIVATE', scope: DRIVE_SCOPE }; },
    async refresh() { context.refreshes++; return { access_token: 'REFRESHED_PRIVATE' }; },
    async identity() { return { user: { emailAddress: TEST_EMAIL } }; },
    async metadata() { return { id: MASTER_ID, name: 'maestro.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }; },
    ...overrides,
  };
  const store = async (op, p) => {
    context.calls.push(op);
    if (op === 'begin' || op==='begin_renew') {
      if (context.record && op==='begin') return false;
      states.set(p.p_state_hash, { ...p }); return true;
    }
    if (op === 'launch') {
      const row = [...states.values()].find(x => x.p_launch_hash === p.p_launch_hash && !x.expired);
      if (!row) return null;
      row.p_launch_hash = null; row.p_binding_hash = p.p_binding_hash; return row.p_payload;
    }
    if (op === 'consume') {
      const row = states.get(p.p_state_hash);
      if (!row || row.p_binding_hash !== p.p_binding_hash || row.expired) return null;
      states.delete(p.p_state_hash); return row.p_payload;
    }
    if (op === 'connect' || op==='connect_renew') {
      if (op==='connect' && context.record) return false;
      if (op==='connect_renew' && (context.record?.token_cipher??null)!==p.p_expected_cipher)return false;
      context.record = { token_cipher: p.p_token_cipher }; return true;
    }
    if (op === 'read') return context.record;
    if (op === 'checked') return '2026-08-28T13:00:00Z';
  };
  const handler = createDriveOAuthHandler({ clientId, clientSecret: 'test-secret', encryptionKey, adminSecret, store, google, authorizeReconnect });
  const request = (path, options = {}) => handler(new Request(`${BASE_URL}${path}`, options));
  const admin = path => request(path, { method: 'POST', headers: { Authorization: `Bearer ${adminSecret}` } });
  async function launch() {
    const start = await admin('/start'); assert.equal(start.status, 200);
    const url = (await start.json()).launchUrl;
    const response = await handler(new Request(url)); assert.equal(response.status, 303);
    const state = new URL(response.headers.get('Location')).searchParams.get('state');
    const cookie = response.headers.get('Set-Cookie').split(';')[0];
    return { url, state, cookie, response };
  }
  const callback = (flow, query = '') => request(`/callback?state=${flow.state}&code=test-code&picked_file_ids=${MASTER_ID}${query}`, { headers: { Cookie: flow.cookie } });
  return { context, states, handler, request, admin, launch, callback, encryptionKey };
}

test('OAuth: cifrado autenticado y separación por propósito/cliente', async () => {
  const cipher = await createCipher('a'.repeat(64), clientId);
  const value = await cipher.seal({ secret: 'PRIVATE' }, 'refresh');
  assert.ok(!value.includes('PRIVATE'));
  assert.deepEqual(await cipher.open(value, 'refresh'), { secret: 'PRIVATE' });
  await assert.rejects(cipher.open(value, 'state'));
  await assert.rejects((await createCipher('a'.repeat(64), 'other')).open(value, 'refresh'));
  await assert.rejects(cipher.open(value.slice(0, -2) + (value.endsWith('ff') ? '00' : 'ff'), 'refresh'));
});
test('OAuth: rutas administrativas rechazan credenciales ajenas antes de almacenar', async () => {
  const s = setup();
  for (const path of ['/start', '/verify']) {
    assert.equal((await s.request(path, { method: 'POST' })).status, 401);
    assert.equal((await s.request(path, { method: 'POST', headers: { Authorization: 'Bearer ' + 'c'.repeat(64) } })).status, 401);
    assert.equal((await s.request(path)).status, 405);
  }
  assert.deepEqual(s.context.calls, []);
});
test('OAuth: no acepta cuerpo ni parámetros para ampliar alcance', async () => {
  const s = setup();
  assert.equal((await s.request('/start', { method: 'POST', headers: { Authorization: 'Bearer ' + 'a'.repeat(64) }, body: '{}' })).status, 400);
  assert.equal((await s.admin('/start?email=other')).status, 400);
});
test('OAuth: acepta POST con stream vacío como el gateway Deno', async () => {
  const s = setup();
  const result = await s.handler(new Request(`${BASE_URL}/start`, { method: 'POST',
    headers: { Authorization: 'Bearer ' + 'a'.repeat(64), 'Content-Length': '0' },
    body: new ReadableStream({ start(controller) { controller.close(); } }), duplex: 'half' }));
  assert.equal(result.status, 200);
});
test('OAuth: launch de uso único y cookie segura; estado no aparece en texto claro en almacén', async () => {
  const s = setup(), flow = await s.launch();
  assert.equal((await s.handler(new Request(flow.url))).status, 400);
  const cookie = flow.response.headers.get('Set-Cookie');
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=600']) assert.ok(cookie.includes(flag));
  assert.ok(!JSON.stringify([...s.states.values()]).includes(flow.state));
});
test('OAuth: callback sin cookie, duplicado o de otro navegador no consume estado', async () => {
  const s = setup(), flow = await s.launch();
  assert.equal((await s.request(`/callback?state=${flow.state}`)).status, 400);
  assert.equal((await s.callback({ ...flow, cookie: '__Secure-arles-drive-state=' + 'd'.repeat(64) })).status, 400);
  assert.equal((await s.callback(flow, `&state=${flow.state}`)).status, 400);
  assert.equal(s.states.size, 1);
  assert.equal((await s.callback(flow)).status, 200);
  assert.equal((await s.callback(flow)).status, 400);
});
test('OAuth: cancelación, archivo ajeno y estado vencido no crean conexión', async () => {
  for (const mode of ['cancel', 'file', 'expired']) {
    const s = setup(), flow = await s.launch();
    if (mode === 'expired') [...s.states.values()][0].expired = true;
    const path = `/callback?state=${flow.state}&` + (mode === 'cancel' ? 'error=access_denied' : `code=c&picked_file_ids=${mode === 'file' ? 'OTHER' : MASTER_ID}`);
    assert.equal((await s.request(path, { headers: { Cookie: flow.cookie } })).status, 400);
    assert.equal(s.context.record, null); assert.ok(!s.context.calls.includes('exchange'));
  }
});
test('OAuth: rechaza otra cuenta, otro maestro o permisos excesivos sin filtrar secretos', async () => {
  for (const override of [
    { identity: async () => ({ user: { emailAddress: 'other@example.com' } }) },
    { metadata: async () => ({ id: 'OTHER' }) },
    { exchange: async () => ({ access_token: 'SECRET', refresh_token: 'SECRET', scope: DRIVE_SCOPE + ' extra' }) },
    { exchange: async () => { throw new Error('SECRET'); } },
    { exchange: async () => ({ access_token: 'SECRET', scope: DRIVE_SCOPE }) },
  ]) {
    const s = setup(override), flow = await s.launch(), response = await s.callback(flow);
    assert.equal(response.status, 502); assert.ok(!(await response.text()).includes('SECRET'));
    assert.equal(s.context.record, null);
  }
});
test('OAuth: autorización válida se cifra, no se sobrescribe, y renovación es real en adaptador', async () => {
  const s = setup(), flow = await s.launch();
  assert.equal((await s.callback(flow)).status, 200);
  assert.ok(!JSON.stringify(s.context.record).includes('REFRESH_PRIVATE'));
  const stored = await (await createCipher(s.encryptionKey, clientId)).open(s.context.record.token_cipher, 'refresh');
  assert.equal(stored.refreshToken, 'REFRESH_PRIVATE');
  assert.equal((await s.admin('/start')).status, 409);
  const verified = await s.admin('/verify');
  assert.equal(verified.status, 200); assert.equal(s.context.refreshes, 1);
  const result = await verified.json(); assert.equal(result.refreshed, true);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
test('OAuth: fallo de renovación no se declara éxito ni actualiza validación', async () => {
  const s = setup({ refresh: async () => { throw new Error('invalid_grant PRIVATE'); } });
  await s.callback(await s.launch());
  const result = await s.admin('/verify'); assert.equal(result.status, 502);
  assert.ok(!(await result.text()).includes('PRIVATE')); assert.ok(!s.context.calls.includes('checked'));
});
test('OAuth: configuración incompleta falla cerrada', async () => {
  const handler = createDriveOAuthHandler({ adminSecret: 'a'.repeat(64) });
  const result = await handler(new Request(`${BASE_URL}/start`, { method: 'POST', headers: { Authorization: 'Bearer ' + 'a'.repeat(64) } }));
  assert.equal(result.status, 502);
});
test('OAuth: RPC fija destino, no sigue redirecciones y no expone error remoto', async () => {
  const rpc = createRpcStore('secret', async (url, options) => {
    assert.equal(url, 'https://dziwhbjyvxdbplthpazt.supabase.co/rest/v1/rpc/web1_drive_oauth_read');
    assert.equal(options.redirect, 'error'); assert.equal(options.method, 'POST');
    return new Response('PRIVATE', { status: 500 });
  });
  await assert.rejects(rpc('read'), { message: 'storage_unavailable' });
  await assert.rejects(rpc('other'), { message: 'invalid_rpc' });
});
test('OAuth: nonces aleatorios de 256 bits y huellas SHA-256', async () => {
  const a = randomHex(), b = randomHex();
  assert.match(a, /^[a-f0-9]{64}$/); assert.notEqual(a, b);
  assert.match(await digest(a), /^[a-f0-9]{64}$/);
});

test('WEB3 reconexión deniega visitante incluso con secreto administrativo',async()=>{
  const s=setup();assert.equal((await s.admin('/reconnect')).status,401);assert.deepEqual(s.context.calls,[]);
});
test('WEB3 reconexión conserva token al cancelar o fallar renovación y evita replay',async()=>{
  for(const outcome of ['cancel','fail','ok']){
    const s=setup(outcome==='fail'?{refresh:async()=>{throw new Error('revoked')}}:{},async()=>({uid:'test-user'}));
    s.context.record={token_cipher:'ORIGINAL'};
    const start=await s.request('/reconnect',{method:'POST'});assert.equal(start.status,200);
    assert.equal(s.context.record.token_cipher,'ORIGINAL');
    const launch=await s.handler(new Request((await start.json()).launchUrl));
    const flow={state:new URL(launch.headers.get('location')).searchParams.get('state'),cookie:launch.headers.get('set-cookie').split(';')[0]};
    const result=await s.callback(flow,outcome==='cancel'?'&error=access_denied':'');
    assert.equal(result.status,outcome==='ok'?200:outcome==='fail'?502:400);
    if(outcome==='ok')assert.notEqual(s.context.record.token_cipher,'ORIGINAL');else assert.equal(s.context.record.token_cipher,'ORIGINAL');
    assert.equal((await s.callback(flow)).status,400);
  }
});
