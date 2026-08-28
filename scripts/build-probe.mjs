import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = { bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', sourcemap: false };
await build({ ...options, entryPoints: [path.join(root, 'src/importer/parse-master.ts')], outfile: path.join(root, 'dist/web-probe.mjs') });
await build({ ...options, entryPoints: [path.join(root, 'tests/fixtures/desktop/parse-master.ts')], outfile: path.join(root, 'dist/desktop-reference.mjs') });
console.log('Dos lectores compilados: referencia de escritorio y prototipo por bytes.');
