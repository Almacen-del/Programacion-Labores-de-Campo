import { parseMasterBytes } from '../../../src/importer/parse-master.ts';
import { createProbeHandler } from '../_shared/web1-probe.mjs';

// Solo secretos de servidor. No requiere ni expone credenciales Drive o service_role.
Deno.serve(createProbeHandler({
  secret: Deno.env.get('WEB1_PROBE_SECRET'),
  expectedHash: Deno.env.get('WEB1_EXPECTED_XLSX_SHA256'),
  parse: parseMasterBytes,
}));
