import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFile = path.resolve(root, process.argv[2] ?? '.private/source/maestro-2026-08-28.xlsx');
const runs = [];
// Procesos independientes y secuenciales para no contaminar tiempos con competencia local.
for (const kind of ['desktop', 'web']) {
  for (let iteration = 1; iteration <= 3; iteration++) {
    const run = JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts/measure-worker.mjs'), kind, sourceFile], { encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 }));
    runs.push({ iteration, ...run });
    console.log(JSON.stringify({ kind, iteration, cpuMs: run.cpuMs, durationMs: run.durationMs, processPeakRssMiB: run.processPeakRssMiB, total: run.summary.total }));
  }
}
const parity = runs.every(run => run.fileHash === runs[0].fileHash && run.snapshotHash === runs[0].snapshotHash);
const report = {
  createdAt: new Date().toISOString(), environment: 'Local Windows / Node; NO es Supabase Edge',
  source: { driveId: '1ZJKtvkmo7fddZi4CS30vcaXXZSOTuIzz', acquisition: 'Descarga XLSX autenticada de Google; solo lectura', localPath: path.relative(root, sourceFile) },
  parity, runs,
  limitations: ['CPU y RSS locales no equivalen a las métricas del servidor.', 'JSON serializado no equivale al tamaño PostgreSQL con índices e historial.', 'Esta prueba no verifica OAuth, cron ni actualización automática.']
};
await fs.mkdir(path.join(root, '.private/evidence'), { recursive: true });
const name = `local-benchmark-${Date.now()}.json`;
await fs.writeFile(path.join(root, '.private/evidence', name), JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ parity, evidence: `.private/evidence/${name}` }));
if (!parity) process.exitCode = 1;
