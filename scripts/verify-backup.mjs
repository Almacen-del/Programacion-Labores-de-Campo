import fs from 'node:fs/promises';
import {verifyOfflineRecovery} from './lib/backup.mjs';
const file=process.argv[2];
if(!file)throw Error('Uso: node scripts/verify-backup.mjs ruta-al-respaldo.json');
if((await fs.stat(file)).size>70*1048576)throw Error('BACKUP_TOO_LARGE');
try{console.log(JSON.stringify(await verifyOfflineRecovery(await fs.readFile(file,'utf8'))))}
catch{console.error('Respaldo inválido o recuperación incompleta. No se modificó producción.');process.exitCode=1}
