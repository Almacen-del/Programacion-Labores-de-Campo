import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, '.private/probe-credentials');
await fs.mkdir(directory, { recursive: true });
const filename = path.join(directory, 'web1-probe.json');
await fs.writeFile(filename, JSON.stringify({
  projectRef: 'dziwhbjyvxdbplthpazt',
  secret: randomBytes(32).toString('hex'),
  createdAt: new Date().toISOString(),
}), { flag: 'wx', mode: 0o600 });
console.log('Credencial de prueba creada en carpeta privada; valor no mostrado.');
