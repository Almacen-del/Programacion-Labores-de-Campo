import { build } from 'esbuild';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(root, '.private/deploy/drive-oauth.ts');
await build({ entryPoints: [path.join(root, 'supabase/functions/drive-oauth/index.ts')],
  outfile, bundle: true, platform: 'neutral', format: 'esm', target: 'es2022',
  alias: { 'google-auth-library': 'npm:google-auth-library@11.0.2' },
  external: ['node:*', 'npm:*'], sourcemap: false });
const bytes = await fs.readFile(outfile);
console.log(JSON.stringify({ artifact: '.private/deploy/drive-oauth.ts', bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex') }));
