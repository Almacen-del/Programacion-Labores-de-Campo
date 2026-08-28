import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_URL, MASTER_ID, TEST_EMAIL } from '../supabase/functions/_shared/drive-oauth.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || 'gates';
if (!['gates', 'start', 'verify'].includes(mode)) throw new Error('Use gates, start or verify');
const config = JSON.parse(await fs.readFile(path.join(root, '.private/probe-credentials/drive-oauth.json'), 'utf8'));
if (config.projectRef !== 'dziwhbjyvxdbplthpazt' || !/^[a-f0-9]{64}$/.test(config.adminSecret)) throw new Error('Invalid local configuration');
const evidence = { at: new Date().toISOString(), mode, endpoint: BASE_URL, checks: [] };
async function call(route, { method = 'POST', auth = 'none', headers = {} } = {}) {
  return fetch(BASE_URL + route, { method, redirect: 'manual', signal: AbortSignal.timeout(45000),
    headers: { ...headers, ...(auth !== 'none' ? { Authorization: `Bearer ${auth === 'valid' ? config.adminSecret : '0'.repeat(64)}` } : {}) } });
}
async function gate(name, route, options, expected) {
  const response = await call(route, options);
  evidence.checks.push({ name, expected, status: response.status, pass: response.status === expected });
  await response.body?.cancel();
  if (response.status !== expected) throw new Error(`Gate failed: ${name} (${response.status})`);
}
try {
  if (mode === 'gates') {
    await gate('start_without_secret', '/start', {}, 401);
    await gate('start_wrong_secret', '/start', { auth: 'wrong' }, 401);
    await gate('verify_without_secret', '/verify', {}, 401);
    await gate('callback_without_state', '/callback', { method: 'GET' }, 400);
    await gate('callback_unknown_state', '/callback?state=' + '1'.repeat(64), {
      method: 'GET', headers: { Cookie: '__Secure-arles-drive-state=' + '2'.repeat(64) },
    }, 400);
    await gate('launch_missing_ticket', '/launch', { method: 'GET' }, 400);
  } else if (mode === 'start') {
    const response = await call('/start', { auth: 'valid' });
    evidence.status = response.status;
    if (!response.ok) throw new Error(`Start failed (${response.status})`);
    const result = await response.json();
    const url = new URL(result.launchUrl);
    if (url.origin !== new URL(BASE_URL).origin || url.pathname !== '/functions/v1/drive-oauth/launch' || !/^[a-f0-9]{64}$/.test(url.searchParams.get('ticket') || '')) throw new Error('Unexpected launch URL');
    await fs.writeFile(path.join(root, '.private/probe-credentials/drive-oauth-start.json'), JSON.stringify(result), { mode: 0o600 });
    evidence.launchSavedPrivately = true;
  } else {
    const response = await call('/verify', { auth: 'valid' });
    evidence.status = response.status;
    if (!response.ok) throw new Error(`Verification failed (${response.status})`);
    const result = await response.json();
    if (result.connected !== true || result.refreshed !== true || result.account !== TEST_EMAIL || result.master?.id !== MASTER_ID) throw new Error('Unexpected verification result');
    evidence.connected = true; evidence.refreshed = true;
    evidence.account = result.account; evidence.checkedAt = result.checkedAt;
    evidence.master = { id: result.master.id, name: result.master.name, mimeType: result.master.mimeType,
      modifiedTime: result.master.modifiedTime, size: result.master.size };
  }
  evidence.pass = true;
} catch (error) {
  evidence.pass = false;
  // Only our bounded messages, never provider payloads or credentials.
  evidence.error = error instanceof Error && /^(Gate failed:|Start failed|Verification failed|Unexpected)/.test(error.message)
    ? error.message : 'Request failed';
  process.exitCode = 1;
} finally {
  config.adminSecret = ''; config.clientSecret = ''; config.encryptionKey = '';
  await fs.mkdir(path.join(root, '.private/evidence'), { recursive: true });
  await fs.writeFile(path.join(root, `.private/evidence/drive-oauth-${mode}-${Date.now()}.json`), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}
