import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseMasterBytes } from '../dist/web-probe.mjs';
import { parseMasterWorkbook } from '../dist/desktop-reference.mjs';

const [kind, file] = process.argv.slice(2);
if (!['desktop', 'web'].includes(kind) || !file) throw new Error('Uso: measure-worker.mjs desktop|web archivo.xlsx');
const cpuStart = process.cpuUsage();
const start = performance.now();
const result = kind === 'desktop' ? await parseMasterWorkbook(file) : await parseMasterBytes(await fs.readFile(file));
const durationMs = performance.now() - start;
const cpu = process.cpuUsage(cpuStart);
const snapshot = JSON.stringify({ sheets: result.sheets, records: result.records, summary: result.summary });
// Nunca imprimir registros, nombres de personas, tokens o contenido del archivo.
console.log(JSON.stringify({
  kind, measuredAt: new Date().toISOString(), runtime: process.version,
  durationMs: Math.round(durationMs), cpuMs: Math.round((cpu.user + cpu.system) / 1000),
  processPeakRssMiB: Math.round(process.resourceUsage().maxRSS / 1024 * 10) / 10,
  fileHash: result.fileHash, fileBytes: result.fileSize,
  snapshotHash: createHash('sha256').update(snapshot).digest('hex'),
  snapshotJsonBytes: Buffer.byteLength(snapshot), summary: result.summary,
  sheets: result.sheets.map(({ name, status, importedRowCount, rowCount }) => ({ name, status, importedRowCount, rowCount }))
}));
