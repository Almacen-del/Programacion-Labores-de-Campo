import { createHash } from 'node:crypto';
import { PROJECT_URL, MASTER_ID, DRIVE_SCOPE, TEST_EMAIL, createCipher, createRpcStore } from './drive-oauth.mjs';
export const SYNC_URL = `${PROJECT_URL}/functions/v1/master-sync`;
export const PARSER_REVISION = 'ma-f-009-v1';
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;
const encoder = new TextEncoder();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const secretShape = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uuidShape = value => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value || '');
const CODES = new Set(['OAUTH_NOT_CONNECTED', 'OAUTH_MISMATCH', 'GOOGLE_ACCESS_FAILED', 'MASTER_INVALID',
  'FILE_TOO_LARGE', 'DOWNLOAD_INVALID', 'SOURCE_CHANGED', 'STRUCTURE_CHANGED', 'EMPTY_MASTER',
  'SNAPSHOT_TOO_LARGE', 'STORAGE_LIMIT', 'LOG_LIMIT', 'LEASE_LOST', 'DATABASE_FAILED', 'PARSER_FAILED']);
export class SyncError extends Error {
  constructor(code) { super(CODES.has(code) ? code : 'DATABASE_FAILED'); this.code = this.message; }
}
const reply = (value, status = 200) => Response.json(value, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
} });
const normalize = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
export function metadataStamp(file) {
  const size = Number(file?.size);
  if (file?.id !== MASTER_ID || file.trashed || file.mimeType !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      !file.modifiedTime || !file.version || !Number.isSafeInteger(size) || size <= 0) throw new SyncError('MASTER_INVALID');
  if (size > MAX_FILE_BYTES) throw new SyncError('FILE_TOO_LARGE');
  return JSON.stringify([file.id, String(file.version), file.modifiedTime, String(file.size), file.md5Checksum || '']);
}
export async function readDownload(response) {
  if (!response.ok || !response.body) throw new SyncError('GOOGLE_ACCESS_FAILED');
  const declared = response.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_FILE_BYTES)) {
    await response.body.cancel(); throw new SyncError('FILE_TOO_LARGE');
  }
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_FILE_BYTES) { await reader.cancel(); throw new SyncError('FILE_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!size) throw new SyncError('DOWNLOAD_INVALID');
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
export function createSyncStore(serviceKey, fetchImpl = fetch) {
  return async (operation, args = {}) => {
    if (!serviceKey || !['begin', 'finish', 'status', 'schedule'].includes(operation)) throw new SyncError('DATABASE_FAILED');
    const response = await fetchImpl(`${PROJECT_URL}/rest/v1/rpc/web1_sync_${operation}`, {
      method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args), redirect: 'error', signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      // Solo SQLSTATE: nunca detalles, payload, cabeceras ni credenciales.
      if (/^[A-Z0-9]{5}$/.test(error.code??'')) console.error('MASTER_SYNC_SQLSTATE',error.code);
      throw new SyncError(CODES.has(error.message) ? error.message : 'DATABASE_FAILED');
    }
    return response.json();
  };
}
export function createStoredDrive({ clientId, encryptionKey, serviceKey, google, oauthStore = createRpcStore(serviceKey) }) {
  return async () => {
    const record = await oauthStore('read');
    if (!record) throw new SyncError('OAUTH_NOT_CONNECTED');
    const cipher = await createCipher(encryptionKey, clientId);
    const value = await cipher.open(record.token_cipher, 'refresh');
    if (value.clientId !== clientId || value.masterId !== MASTER_ID || value.email !== TEST_EMAIL || value.scope !== DRIVE_SCOPE) throw new SyncError('OAUTH_MISMATCH');
    let refreshed;
    try { refreshed = await google.refresh(value.refreshToken); }
    catch { throw new SyncError('GOOGLE_ACCESS_FAILED'); }
    if (!refreshed.access_token || (refreshed.scope && refreshed.scope !== DRIVE_SCOPE)) throw new SyncError('OAUTH_MISMATCH');
    return {
      metadata: () => google.metadata(refreshed.access_token),
      download: () => google.download(refreshed.access_token),
    };
  };
}
async function smallEmptyBody(request) {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > 512)) return false;
  if (!request.body) return true;
  const reader = request.body.getReader(); let text = '', size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 512) return false;
      text += new TextDecoder().decode(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return text.trim() === '' || text.trim() === '{}';
}
export function createSyncHandler({ syncSecret, adminSecret, store, openDrive, parse, clock = () => performance.now() }) {
  return async request => {
    const url = new URL(request.url), route = url.pathname.replace(/^\/functions\/v1/, '');
    const isRun = route === '/master-sync/run';
    const admin = route === '/master-sync/status' || route === '/master-sync/schedule';
    if (!isRun && !admin) return reply({ error: 'NOT_FOUND' }, 404);
    const expected = isRun ? syncSecret : adminSecret;
    const auth = request.headers.get('authorization') || '';
    if (!secretShape(expected) || auth.length !== 71 || hash(auth) !== hash(`Bearer ${expected}`)) return reply({ error: 'UNAUTHORIZED' }, 401);
    if (request.method !== (route.endsWith('/status') ? 'GET' : 'POST')) return reply({ error: 'METHOD_NOT_ALLOWED' }, 405);
    if (url.search || !await smallEmptyBody(request)) return reply({ error: 'INVALID_REQUEST' }, 400);
    if (!secretShape(syncSecret) || !secretShape(adminSecret)) return reply({ error: 'NOT_CONFIGURED' }, 503);
    let runId = null;
    const started = clock();
    const metrics = { downloadedBytes: 0, snapshotJsonBytes: 0, parseWallMs: 0, metadataCalls: 0, cpuMeasured: false };
    try {
      if (route.endsWith('/status')) return reply(await store('status'));
      if (route.endsWith('/schedule')) return reply(await store('schedule', { p_secret: syncSecret }));
      const dispatch = request.headers.get('x-arles-dispatch-id');
      if (dispatch !== null && !uuidShape(dispatch)) return reply({ error: 'INVALID_DISPATCH' }, 400);
      const lease = await store('begin', { p_dispatch_id: dispatch });
      if (!lease) return reply({ status: 'BUSY' }, 409);
      runId = lease.run_id;
      const drive = await openDrive();
      const metadata = await drive.metadata(); metrics.metadataCalls++;
      const stamp = metadataStamp(metadata);
      const prior = lease.current;
      const finish = async (status, fileHash, snapshotHash, payload = null) => {
        const committed = await store('finish', { p_run_id: runId, p_status: status,
          p_meta: { stamp, modifiedTime: metadata.modifiedTime, version: metadata.version, size: metadata.size },
          p_file_hash: fileHash, p_snapshot_hash: snapshotHash, p_payload: payload,
          p_metrics: { ...metrics, beforeCommitWallMs: Math.round(clock() - started) }, p_error_code: null });
        return reply({ status, runId, ...committed });
      };
      if (prior?.source_stamp === stamp && prior.parser_revision === PARSER_REVISION)
        return await finish('UNCHANGED', prior.file_hash, prior.snapshot_hash);
      const bytes = await readDownload(await drive.download()); metrics.downloadedBytes = bytes.byteLength;
      if (bytes.byteLength !== Number(metadata.size)) throw new SyncError('DOWNLOAD_INVALID');
      if (metadata.md5Checksum && createHash('md5').update(bytes).digest('hex') !== metadata.md5Checksum) throw new SyncError('SOURCE_CHANGED');
      const after = await drive.metadata(); metrics.metadataCalls++;
      if (metadataStamp(after) !== stamp) throw new SyncError('SOURCE_CHANGED');
      const fileHash = hash(bytes);
      if (prior?.file_hash === fileHash && prior.parser_revision === PARSER_REVISION)
        return await finish('UNCHANGED', fileHash, prior.snapshot_hash);
      const parseStart = clock(); let parsed;
      try { parsed = await parse(bytes); } catch { throw new SyncError('PARSER_FAILED'); }
      metrics.parseWallMs = Math.round(clock() - parseStart);
      const imported = new Set(parsed.sheets.filter(s => s.status === 'IMPORTED').map(s => normalize(s.name)));
      if (!['siembras nuevas', 'siembra de produccion', 'plateo mecanico'].every(name => imported.has(name))) throw new SyncError('STRUCTURE_CHANGED');
      // Un maestro reconocido puede quedar sin filas elegibles. Debe vaciar la
      // vista vigente, no conservar filas a las que se les quitaron las claves.
      if (!Array.isArray(parsed.records) || parsed.summary.total !== parsed.records.length) throw new SyncError('EMPTY_MASTER');
      const payload = JSON.stringify({ sheets: parsed.sheets, records: parsed.records, summary: parsed.summary });
      metrics.snapshotJsonBytes = encoder.encode(payload).byteLength;
      if (metrics.snapshotJsonBytes > MAX_SNAPSHOT_BYTES) throw new SyncError('SNAPSHOT_TOO_LARGE');
      return await finish('UPDATED', fileHash, hash(payload), payload);
    } catch (error) {
      const code = error instanceof SyncError ? error.code : 'GOOGLE_ACCESS_FAILED';
      if (runId) {
        try { await store('finish', { p_run_id: runId, p_status: 'ERROR', p_meta: null,
          p_file_hash: null, p_snapshot_hash: null, p_payload: null,
          p_metrics: { ...metrics, beforeCommitWallMs: Math.round(clock() - started) }, p_error_code: code }); }
        catch { /* The lease expires; the next invocation records interruption. */ }
      }
      return reply({ status: 'ERROR', error: code, runId }, 502);
    }
  };
}
