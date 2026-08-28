import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSheets, parseMasterBytes } from '../dist/web-probe.mjs';
import { parseSheets as reference } from '../dist/desktop-reference.mjs';

const headers = ['Día', 'Mes', 'Año', 'Colaborador', 'Año siembra', 'Lote', 'Actividad', 'Cantidad'];
const row = [28, 8, 2026, 'Prueba sintética', 2020, 'L-1', 'Plateo', 12];
const make = (rows, name = 'Siembras nuevas') => [{ sheet: name, data: [headers, ...rows] }];
test('mismas reglas y hashes que el lector de escritorio', () => {
  const input = make([row, row, [31, 2, 2026, null, null, null, null, 'texto'], [], [28, 8, 2026, 'Prueba', 2020, 'L1 / L2', 'Labor', '1,5']]);
  assert.deepEqual(parseSheets(input), reference(input));
});
test('conserva trazabilidad y detecta duplicados sin borrar filas', () => {
  const result = parseSheets(make([row, row]));
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].sourceRow, 2);
  assert.equal(result.records[1].sourceRow, 3);
  assert.ok(result.records[1].alerts.some(a => a.code === 'EXACT_DUPLICATE'));
});
test('fechas imposibles y lote/labor faltantes bloquean la fila', () => {
  const result = parseSheets(make([[31, 2, 2026, 'Prueba', 2020, null, null, 1]]));
  assert.equal(result.summary.blocked, 1);
  for (const code of ['INVALID_DATE', 'MISSING_LOT', 'MISSING_LABOR']) assert.ok(result.records[0].alerts.some(a => a.code === code));
});
test('ignora hojas no aprobadas y reconoce tildes', () => {
  assert.equal(parseSheets(make([row], 'Siembra de producción')).summary.total, 1);
  assert.equal(parseSheets(make([row], 'No autorizada')).summary.total, 0);
});
test('rechaza bytes vacíos, excesivos y archivo no XLSX', async () => {
  await assert.rejects(parseMasterBytes(new Uint8Array()), /vacío/);
  await assert.rejects(parseMasterBytes(new Uint8Array(25 * 1024 * 1024 + 1)), /25 MB/);
  await assert.rejects(parseMasterBytes(new TextEncoder().encode('no es excel')));
});
