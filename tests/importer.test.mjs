import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSheets, parseMasterBytes } from '../dist/web-probe.mjs';
import { parseSheets as reference } from '../dist/desktop-reference.mjs';

const headers = ['Día', 'Mes', 'Año', 'Colaborador', 'Año siembra', 'Lote', 'Actividad', 'Cantidad'];
const row = [28, 8, 2026, 'Prueba sintética', 2020, 'L-1', 'Plateo', 12];
const make = (rows, name = 'Siembras nuevas') => [{ sheet: name, data: [headers, ...rows] }];
test('conserva reglas y hashes de escritorio para filas con ambas claves', () => {
  const input = make([row, row, [31, 2, 2026, null, 2020, 'L2', null, 'texto'], [], [28, 8, 2026, 'Prueba', 2020, 'L1 / L2', 'Labor', '1,5']]);
  assert.deepEqual(parseSheets(input), reference(input));
});
test('conserva trazabilidad y detecta duplicados sin borrar filas', () => {
  const result = parseSheets(make([row, row]));
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].sourceRow, 2);
  assert.equal(result.records[1].sourceRow, 3);
  assert.ok(result.records[1].alerts.some(a => a.code === 'EXACT_DUPLICATE'));
});
test('fechas imposibles y labor faltante bloquean filas con claves completas', () => {
  const result = parseSheets(make([[31, 2, 2026, 'Prueba', 2020, 'L1', null, 1]]));
  assert.equal(result.summary.blocked, 1);
  for (const code of ['INVALID_DATE', 'MISSING_LABOR']) assert.ok(result.records[0].alerts.some(a => a.code === code));
});
test('omite si falta cualquiera de las claves; completar la fila la reincorpora', () => {
  const missingYear=[...row];missingYear[4]=null;
  const missingLot=[...row];missingLot[5]=' \t ';
  const missingBoth=[...missingYear];missingBoth[5]=null;
  const input=make([missingYear,missingLot,missingBoth,row]);
  const initial=parseSheets(input);
  assert.equal(initial.summary.total,1);assert.equal(initial.summary.alerts,0);
  assert.equal(initial.records[0].sourceRow,5);assert.equal(initial.sheets[0].importedRowCount,1);
  input[0].data[1][4]=2021;
  const corrected=parseSheets(input);
  assert.equal(corrected.summary.total,2);assert.equal(corrected.records[0].sourceRow,2);
  input[0].data[1][5]=null;
  assert.equal(parseSheets(input).summary.total,1);
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
