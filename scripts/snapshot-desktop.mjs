import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, '.private', 'desktop-baseline');
const manifestPath = path.join(root, '.private', 'desktop-baseline.json');
const verify = process.argv.includes('--verify');
const savedManifest = verify ? JSON.parse(await fs.readFile(manifestPath, 'utf8')) : null;
const sourceFlag = process.argv.indexOf('--source');
const sourcePath = verify ? savedManifest.source : sourceFlag >= 0 ? process.argv[sourceFlag + 1] : null;
if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath)) {
  throw new Error('Indique la ruta absoluta del escritorio con --source. La verificación usa la ruta guardada en el manifiesto.');
}
const source = await fs.realpath(sourcePath);
if (source === await fs.realpath(root)) throw new Error('El origen debe ser el proyecto de escritorio, no este proyecto web.');
const entries = ['apps/desktop/src', 'packages', 'docs', 'scripts', 'package.json', 'package-lock.json', 'README.md', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', '.gitignore', 'config/google-oauth.example.json'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function* files(relative) {
  const current = path.join(source, relative);
  const stat = await fs.lstat(current);
  if (stat.isSymbolicLink()) throw new Error('No se copian enlaces simbólicos');
  if (stat.isDirectory()) {
    for (const name of (await fs.readdir(current)).sort()) yield* files(path.join(relative, name));
  } else if (stat.isFile()) yield relative;
}

if (verify) {
  const manifest = savedManifest;
  const changes = [];
  for (const entry of manifest.files) {
    try {
      if (hash(await fs.readFile(path.join(source, entry.path))) !== entry.sha256) changes.push(entry.path);
    } catch { changes.push(entry.path); }
  }
  console.log(JSON.stringify({ files: manifest.files.length, originalUnchanged: changes.length === 0, changes }));
  if (changes.length) process.exitCode = 1;
} else {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.mkdir(destination);
  const manifest = { createdAt: new Date().toISOString(), source, excludes: ['Google OAuth credentials', 'tokens', 'SQLite profile', 'node_modules', '.git', 'builds', 'private source files'], files: [] };
  for (const relative of entries) {
    for await (const item of files(relative)) {
      const original = await fs.readFile(path.join(source, item));
      const target = path.join(destination, item);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(path.join(source, item), target, fs.constants.COPYFILE_EXCL);
      if (hash(await fs.readFile(target)) !== hash(original)) throw new Error(`Copia inconsistente: ${item}`);
      manifest.files.push({ path: item, bytes: original.length, sha256: hash(original) });
    }
  }
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ copied: manifest.files.length, bytes: manifest.files.reduce((n, x) => n + x.bytes, 0), verified: true }));
}
