import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRef = 'dziwhbjyvxdbplthpazt';
const endpoint = `https://${projectRef}.supabase.co/functions/v1/web1-probe`;
const credentials = JSON.parse(await fs.readFile(path.join(root, '.private/probe-credentials/web1-probe.json'), 'utf8'));
assert.equal(credentials.projectRef, projectRef, 'Proyecto de la credencial no coincide');
const evidence = { createdAt: new Date().toISOString(), projectRef, endpoint, checks: [], completed: false };
const mode = process.argv.includes('--real') ? 'real' : 'security';
async function invoke(name, expectedStatus, authorization, body) {
  const start = performance.now();
  const headers = { 'content-type': 'application/octet-stream' };
  if (authorization) headers.authorization = authorization;
  const res = await fetch(endpoint, { method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(60000) });
  const text = await res.text();
  let result;
  try { result = JSON.parse(text); } catch { result = { error: 'NON_JSON_RESPONSE' }; }
  // Solo salidas conocidas. Nunca volcar cabeceras de solicitud ni respuesta arbitraria.
  const check = { name, status: res.status, expectedStatus, durationMs: Math.round(performance.now() - start), requestId: res.headers.get('sb-request-id') };
  if (typeof result.error === 'string' && /^[A-Z_]+$/.test(result.error)) check.error = result.error;
  evidence.checks.push(check);
  console.log(JSON.stringify(check));
  assert.equal(res.status, expectedStatus, `Fallo ${name}; no se continúan solicitudes posteriores`);
  return result;
}
try {
  // Estas tres comprobaciones se repiten antes de cualquier envío real.
  await invoke('sin credencial', 401, null, 'synthetic');
  await invoke('credencial incorrecta', 401, 'Bearer invalid-test-token', 'synthetic');
  await invoke('archivo no autorizado', 422, `Bearer ${credentials.secret}`, 'synthetic');
  if (mode === 'real') {
    const bytes = await fs.readFile(path.join(root, '.private/source/maestro-2026-08-28.xlsx'));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), '19fc850b66ab1a98fd48026b647269c07a47d62d819f7ce8d432ab0f0fa4ad4f');
    const result = await invoke('maestro aprobado', 200, `Bearer ${credentials.secret}`, bytes);
    assert.equal(result.fileHash, '19fc850b66ab1a98fd48026b647269c07a47d62d819f7ce8d432ab0f0fa4ad4f');
    assert.equal(result.snapshotHash, 'a5287aab0805eccc03993f5c56c618d2aba19766966589b00705b6d338363205');
    assert.deepEqual(result.summary, { total: 6269, valid: 5943, observed: 148, blocked: 178, alerts: 529 });
    evidence.result = { fileHash: result.fileHash, snapshotHash: result.snapshotHash, fileBytes: result.fileBytes, snapshotJsonBytes: result.snapshotJsonBytes, summary: result.summary, parseWallMs: result.parseWallMs, cpuMeasured: result.cpuMeasured };
    console.log(JSON.stringify(evidence.result));
  }
  evidence.completed = true;
} catch (error) {
  evidence.failure = error instanceof assert.AssertionError ? error.message : 'No se pudo completar la llamada remota';
  console.error(evidence.failure);
  process.exitCode = 1;
} finally {
  const evidenceFile = path.join(root, '.private/evidence', `hosted-${mode}-${Date.now()}.json`);
  await fs.mkdir(path.dirname(evidenceFile), { recursive: true });
  await fs.writeFile(evidenceFile, JSON.stringify(evidence, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ evidence: path.relative(root, evidenceFile), completed: evidence.completed }));
}
