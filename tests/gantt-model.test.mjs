import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {transform} from 'esbuild';
const code=await transform(await fs.readFile(new URL('../src/web/gantt-model.ts',import.meta.url),'utf8'),{loader:'ts',format:'esm'});
const m=await import('data:text/javascript;base64,'+Buffer.from(code.code).toString('base64'));
test('WEB4 fechas estrictas, bisiesto, rango inclusivo y límite',()=>{
 assert.equal(m.parseDate('2026-02-30'),null);assert.equal(m.dates('2024-02-01','2024-02-29').length,29);
 assert.equal(m.dates('2026-01-01','2026-04-03').length,93);assert.deepEqual(m.dates('2026-01-01','2026-04-04'),[]);
 assert.deepEqual(m.dates('2026-08-03','2026-08-01'),[]);
});
test('WEB4 periodos atraviesan mes/año y semana empieza lunes',()=>{
 assert.deepEqual(m.period('2026-08-30','week'),{from:'2026-08-24',to:'2026-08-30'});
 assert.deepEqual(m.period('2026-08-31','week'),{from:'2026-08-31',to:'2026-09-06'});
 const state={mode:'month',from:'2026-12-01',to:'2026-12-31',filters:{lot:'A'}};
 assert.deepEqual(m.movePeriod(state,1),{...state,from:'2027-01-01',to:'2027-01-31'});
 const range={...state,mode:'range',from:'2026-08-30',to:'2026-09-02'};
 assert.equal(m.movePeriod(range,1).from,'2026-09-03');assert.equal(m.laborColor('Siembra'),m.laborColor('Siembra'));
});
