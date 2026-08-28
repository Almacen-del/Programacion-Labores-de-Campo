// WEB 1: conexión de ingeniería, NO login público de usuarios.
export const PROJECT_URL = 'https://dziwhbjyvxdbplthpazt.supabase.co';
export const BASE_URL = `${PROJECT_URL}/functions/v1/drive-oauth`;
export const CALLBACK_URL = `${BASE_URL}/callback`;
export const MASTER_ID = '1ZJKtvkmo7fddZi4CS30vcaXXZSOTuIzz';
export const TEST_EMAIL = 'almacen@arlessas.com';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const COOKIE = '__Secure-arles-drive-state';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const hex = (bytes) => Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
export const randomHex = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const digest = async (s) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(s))));
const fromHex = s => Uint8Array.from(s.match(/../g), x => parseInt(x, 16));
const validNonce = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const safeHeaders = {
  'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { ...safeHeaders, 'Content-Type': 'application/json' },
});
const message = (text, status = 200, clear = false) => new Response(text, {
  status, headers: { ...safeHeaders, 'Content-Type': 'text/plain; charset=utf-8',
    ...(clear ? { 'Set-Cookie': cookie('', 0) } : {}) },
});
const cookie = (binding, maxAge = 600) => `${COOKIE}=${binding}; Path=/functions/v1/drive-oauth; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
const oneParam = (params, name) => params.getAll(name).length === 1 ? params.get(name) : null;
async function emptyBody(request) {
  const length = request.headers.get('content-length');
  if (length !== null && length !== '0') return false;
  if (!request.body) return true;
  // Deno can expose an empty stream for POST, unlike Node's null body.
  const reader = request.body.getReader();
  try { return (await reader.read()).done; }
  finally { await reader.cancel().catch(() => {}); }
}
function bindingCookie(request) {
  const entries = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).filter(x => x.startsWith(`${COOKIE}=`));
  return entries.length === 1 ? entries[0].slice(COOKIE.length + 1) : null;
}

export async function createCipher(keyHex, clientId) {
  if (!validNonce(keyHex)) throw new Error('invalid_encryption_key');
  const key = await crypto.subtle.importKey('raw', fromHex(keyHex), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const additionalData = purpose => encoder.encode(`arles-web1|${clientId}|${MASTER_ID}|${purpose}`);
  return {
    async seal(value, purpose) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: additionalData(purpose) }, key, encoder.encode(JSON.stringify(value)));
      return `v1.${hex(iv)}.${hex(new Uint8Array(encrypted))}`;
    },
    async open(value, purpose) {
      if (typeof value !== 'string' || value.length > 20000 || !/^v1\.[a-f0-9]{24}\.[a-f0-9]{32,}$/.test(value)) throw new Error('invalid_ciphertext');
      const [, iv, encrypted] = value.split('.');
      if (encrypted.length % 2) throw new Error('invalid_ciphertext');
      const decoded = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromHex(iv), additionalData: additionalData(purpose) }, key, fromHex(encrypted));
      return JSON.parse(decoder.decode(decoded));
    },
  };
}

export function createRpcStore(serviceKey, fetchImpl = fetch) {
  if (!serviceKey) throw new Error('missing_service_key');
  return async (operation, args = {}) => {
    if (!['begin', 'launch', 'consume', 'connect', 'read', 'checked'].includes(operation)) throw new Error('invalid_rpc');
    const response = await fetchImpl(`${PROJECT_URL}/rest/v1/rpc/web1_drive_oauth_${operation}`, {
      method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args), redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('storage_unavailable');
    return response.json();
  };
}

export function createDriveOAuthHandler({ clientId, clientSecret, encryptionKey, adminSecret, store, google }) {
  let cipherPromise;
  async function authenticated(request) {
    const supplied = request.headers.get('authorization');
    if (!validNonce(adminSecret) || !supplied || supplied.length !== 71) return false;
    return await digest(supplied) === await digest(`Bearer ${adminSecret}`);
  }
  function checkConfig() {
    if (!/^433631251791-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId || '') ||
        !clientSecret || !validNonce(encryptionKey) || !validNonce(adminSecret)) throw new Error('configuration_incomplete');
    cipherPromise ??= createCipher(encryptionKey, clientId);
    return cipherPromise;
  }
  async function validateAccess(accessToken) {
    const identity = await google.identity(accessToken);
    if (identity?.user?.emailAddress?.toLowerCase() !== TEST_EMAIL) throw new Error('wrong_account');
    const file = await google.metadata(accessToken);
    if (file.id !== MASTER_ID || file.trashed || file.mimeType !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') throw new Error('wrong_master');
    return file;
  }
  return async request => {
    const url = new URL(request.url);
    const route = url.pathname.replace(/^\/functions\/v1/, '');
    const callback = route === '/drive-oauth/callback';
    try {
      if (request.url.length > 12000) return message('Solicitud inválida.', 400);
      if (route === '/drive-oauth/start' || route === '/drive-oauth/verify') {
        if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
        if (!await authenticated(request)) return json({ error: 'unauthorized' }, 401);
        if (url.search || !await emptyBody(request)) return json({ error: 'body_not_allowed' }, 400);
        const cipher = await checkConfig();
        if (route.endsWith('/start')) {
          const state = randomHex(), ticket = randomHex(), verifier = randomHex();
          const payload = await cipher.seal({ state, verifier, email: TEST_EMAIL }, 'state');
          const created = await store('begin', {
            p_state_hash: await digest(state), p_launch_hash: await digest(ticket), p_payload: payload,
          });
          if (!created) return json({ error: 'already_connected' }, 409);
          return json({ launchUrl: `${BASE_URL}/launch?ticket=${ticket}`, expiresIn: 600 });
        }
        const record = await store('read');
        if (!record) return json({ error: 'not_connected' }, 409);
        const stored = await cipher.open(record.token_cipher, 'refresh');
        if (stored.email !== TEST_EMAIL || stored.masterId !== MASTER_ID || stored.clientId !== clientId || stored.scope !== DRIVE_SCOPE) throw new Error('connection_mismatch');
        // Force a refresh; never claim success using a cached access token.
        const renewed = await google.refresh(stored.refreshToken);
        if (!renewed.access_token || (renewed.scope && renewed.scope !== DRIVE_SCOPE)) throw new Error('invalid_refresh');
        const file = await validateAccess(renewed.access_token);
        if (renewed.refresh_token && renewed.refresh_token !== stored.refreshToken) throw new Error('rotation_requires_review');
        const checkedAt = await store('checked');
        return json({ connected: true, refreshed: true, account: TEST_EMAIL, master: {
          id: file.id, name: file.name, mimeType: file.mimeType, modifiedTime: file.modifiedTime, size: file.size,
        }, checkedAt });
      }
      if (route === '/drive-oauth/launch') {
        if (request.method !== 'GET') return message('Método no permitido.', 405);
        const ticket = oneParam(url.searchParams, 'ticket');
        if (!validNonce(ticket)) return message('Enlace inválido o vencido.', 400);
        const cipher = await checkConfig();
        const binding = randomHex();
        const payload = await store('launch', { p_launch_hash: await digest(ticket), p_binding_hash: await digest(binding) });
        if (!payload) return message('Enlace inválido, usado o vencido. Inicia de nuevo.', 400);
        const stateData = await cipher.open(payload, 'state');
        const destination = await google.authorizationUrl(stateData.state, stateData.verifier);
        const parsed = new URL(destination);
        if (parsed.origin !== 'https://accounts.google.com') throw new Error('invalid_authorization_host');
        return new Response(null, { status: 303, headers: { ...safeHeaders, Location: destination, 'Set-Cookie': cookie(binding) } });
      }
      if (callback) {
        if (request.method !== 'GET') return message('Método no permitido.', 405);
        const state = oneParam(url.searchParams, 'state'), binding = bindingCookie(request);
        if (!validNonce(state) || !validNonce(binding)) return message('Retorno inválido. Inicia la conexión desde el enlace autorizado.', 400, true);
        const cipher = await checkConfig();
        // Atomic consumption plus browser binding prevents replay and login CSRF.
        const payload = await store('consume', { p_state_hash: await digest(state), p_binding_hash: await digest(binding) });
        if (!payload) return message('Retorno usado, inválido o vencido. Inicia de nuevo.', 400, true);
        const stateData = await cipher.open(payload, 'state');
        if (stateData.state !== state || stateData.email !== TEST_EMAIL) throw new Error('state_mismatch');
        if (url.searchParams.has('error')) return message('Conexión cancelada. No se guardó ninguna autorización.', 400, true);
        const code = oneParam(url.searchParams, 'code');
        const picked = oneParam(url.searchParams, 'picked_file_ids');
        if (!code || code.length > 4096 || picked !== MASTER_ID) return message('No se autorizó el maestro esperado. No se guardó la conexión.', 400, true);
        const tokens = await google.exchange(code, stateData.verifier);
        if (!tokens.access_token || !tokens.refresh_token || tokens.scope !== DRIVE_SCOPE) throw new Error('incomplete_grant');
        await validateAccess(tokens.access_token);
        const tokenCipher = await cipher.seal({ refreshToken: tokens.refresh_token, email: TEST_EMAIL,
          masterId: MASTER_ID, clientId, scope: DRIVE_SCOPE }, 'refresh');
        if (!await store('connect', { p_token_cipher: tokenCipher })) return message('Ya hay una conexión guardada. No se reemplazó.', 409, true);
        return message('Conexión a Drive guardada de forma segura. Puedes cerrar esta pestaña. Falta comprobar la renovación desde el servidor.', 200, true);
      }
      return message('Ruta no disponible.', 404);
    } catch {
      // No upstream error, code, cookie, token or credential is logged or reflected.
      return callback ? message('No se pudo completar la conexión. Revisa la configuración y vuelve a iniciar; no compartas la URL de retorno.', 502, true)
        : json({ error: 'oauth_operation_failed' }, 502);
    }
  };
}
