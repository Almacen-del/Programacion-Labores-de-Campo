import test from 'node:test';
import assert from 'node:assert/strict';
import { createProbeHandler, sha256 } from '../supabase/functions/_shared/web1-probe.mjs';

// Datos exclusivamente sintéticos. No es una credencial de servidor.
const secret = 'synthetic-test-secret-not-for-real-use';
const body = new TextEncoder().encode('synthetic workbook bytes');
const expectedHash = await sha256(body);
const result = {
  sheets: [{ name: 'Synthetic', status: 'IMPORTED', importedRowCount: 1, rowCount: 2 }],
  records: [{ sensitive: 'DO_NOT_DISCLOSE', collaborator: 'Synthetic only' }],
  summary: { total: 1, valid: 1, observed: 0, blocked: 0, alerts: 0 },
};
const request = (overrides = {}) => new Request('https://example.invalid/probe', {
  method: 'POST', body, headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/octet-stream' }, ...overrides,
});

test('probe deniega acceso antes de llamar al parser', async () => {
  let calls = 0;
  const handler = createProbeHandler({ secret, expectedHash, parse: () => { calls++; } });
  for (const authorization of ['', 'Bearer wrong', 'Bearer anonymous-key']) {
    assert.equal((await handler(request({ headers: { authorization } }))).status, 401);
  }
  assert.equal(calls, 0);
});
test('probe falla cerrado si falta configuración o el secreto es débil', async () => {
  for (const config of [{}, { secret: 'short', expectedHash }, { secret, expectedHash: 'invalid' }]) {
    const handler = createProbeHandler({ ...config, parse: () => assert.fail('No debe procesar') });
    assert.equal((await handler(request())).status, 503);
  }
});
test('probe solo permite POST binario y limita tamaño declarado', async () => {
  const handler = createProbeHandler({ secret, expectedHash, parse: () => assert.fail('No debe procesar') });
  assert.equal((await handler(request({ method: 'GET', body: undefined }))).status, 405);
  assert.equal((await handler(request({ headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' } }))).status, 415);
  assert.equal((await handler(request({ headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/octet-stream', 'content-length': '999999999' } }))).status, 413);
});
test('probe limita bytes reales aunque el tamaño declarado sea menor', async () => {
  const handler = createProbeHandler({ secret, expectedHash, parse: () => assert.fail('No debe procesar') });
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(25 * 1024 * 1024 + 1)); controller.close(); } });
  assert.equal((await handler(request({ body: stream, duplex: 'half', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/octet-stream', 'content-length': '1' } }))).status, 413);
});
test('probe rechaza otra versión de archivo antes de analizarla', async () => {
  const handler = createProbeHandler({ secret, expectedHash, parse: () => assert.fail('No debe procesar') });
  assert.equal((await handler(request({ body: 'another file' }))).status, 422);
});
test('probe devuelve medidas comparables pero nunca registros', async () => {
  const handler = createProbeHandler({ secret, expectedHash, parse: async () => result });
  const res = await handler(request());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const output = await res.json();
  assert.equal(output.snapshotHash, await sha256(new TextEncoder().encode(JSON.stringify(result))));
  assert.equal(output.summary.total, 1);
  assert.equal(output.cpuMeasured, false);
  assert.ok(!JSON.stringify(output).includes('DO_NOT_DISCLOSE'));
  assert.ok(!('records' in output));
});
test('probe oculta errores internos y permite reintentar tras el fallo', async () => {
  let calls = 0;
  const handler = createProbeHandler({ secret, expectedHash, parse: async () => { if (++calls === 1) throw new Error('DO_NOT_DISCLOSE'); return result; } });
  const res = await handler(request());
  assert.equal(res.status, 400);
  assert.ok(!(await res.text()).includes('DO_NOT_DISCLOSE'));
  assert.equal((await handler(request())).status, 200);
});
