// Prueba técnica WEB 1, no API de importación para el usuario final.
// Solo admite la copia concreta previamente aprobada y nunca devuelve sus filas.
const MAX_BYTES = 25 * 1024 * 1024;
const encoder = new TextEncoder();
const response = (status, payload) => Response.json(payload, {
  status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});

export async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sameSecret(received, expected) {
  const [a, b] = await Promise.all([sha256(encoder.encode(received)), sha256(encoder.encode(expected))]);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

async function readBounded(request) {
  if (!request.body) throw new Error('EMPTY');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error('TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (size === 0) throw new Error('EMPTY');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export function createProbeHandler({ secret, expectedHash, parse, clock = () => performance.now() }) {
  // Evita solapamientos dentro de un mismo isolate; no sustituye un lock de servidor.
  let busy = false;
  return async request => {
    if (!secret || secret.length < 32 || !/^[a-f0-9]{64}$/.test(expectedHash ?? '')) {
      return response(503, { error: 'PROBE_NOT_CONFIGURED' });
    }
    const authorization = request.headers.get('authorization') ?? '';
    if (authorization.length > 1024 || !authorization.startsWith('Bearer ') ||
        !await sameSecret(authorization.slice(7), secret)) {
      return response(401, { error: 'UNAUTHORIZED' });
    }
    if (request.method !== 'POST') return response(405, { error: 'METHOD_NOT_ALLOWED' });
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/octet-stream') {
      return response(415, { error: 'EXPECTED_BINARY' });
    }
    const length = request.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) {
      return response(413, { error: 'INVALID_BODY_SIZE' });
    }
    if (busy) return response(429, { error: 'PROBE_BUSY' });
    busy = true;
    try {
      const bytes = await readBounded(request);
      const fileHash = await sha256(bytes);
      if (fileHash !== expectedHash) return response(422, { error: 'UNAPPROVED_WORKBOOK' });
      const start = clock();
      const parsed = await parse(bytes);
      const parseWallMs = Math.round(clock() - start);
      const snapshot = JSON.stringify({ sheets: parsed.sheets, records: parsed.records, summary: parsed.summary });
      const snapshotBytes = encoder.encode(snapshot);
      return response(200, {
        stage: 'WEB1_PROBE_ONLY', fileHash, fileBytes: bytes.byteLength,
        snapshotHash: await sha256(snapshotBytes), snapshotJsonBytes: snapshotBytes.byteLength,
        summary: parsed.summary,
        sheets: parsed.sheets.map(({ name, status, importedRowCount, rowCount }) => ({ name, status, importedRowCount, rowCount })),
        parseWallMs,
        cpuMeasured: false,
      });
    } catch (error) {
      // No filtrar errores del parser: pueden incluir contenido del maestro.
      return response(error?.message === 'TOO_LARGE' ? 413 : 400, { error: 'WORKBOOK_REJECTED' });
    } finally { busy = false; }
  };
}
