import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await fs.writeFile(path.join(root,'.private/probe-credentials/master-sync.json'),JSON.stringify({
  projectRef:'dziwhbjyvxdbplthpazt',secret:randomBytes(32).toString('hex'),createdAt:new Date().toISOString(),
}),{flag:'wx',mode:0o600});
console.log('Credencial de sincronización creada; valor no mostrado.');
