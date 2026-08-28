// Respaldo local derivado. No lee credenciales ni modifica archivos de origen.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseMasterWorkbook} from '../dist/desktop-reference.mjs';
const root=path.resolve(import.meta.dirname,'..');
const folder=path.join(root,'.private/backups/required-keys-20260828');
await fs.mkdir(folder,{recursive:true});
const parsed=await parseMasterWorkbook(path.join(root,'.private/source/maestro-2026-08-28.xlsx'));
const master=JSON.stringify({sheets:parsed.sheets,records:parsed.records,summary:parsed.summary});
const hash=createHash('sha256').update(master).digest('hex');
if(hash!=='a5287aab0805eccc03993f5c56c618d2aba19766966589b00705b6d338363205')throw Error('BACKUP_HASH_MISMATCH');
const inventory=await fs.readFile(path.join(root,'.private/inventory/initial.json'),'utf8');
await fs.writeFile(path.join(folder,'master-before.json'),master,{flag:'wx'});
await fs.writeFile(path.join(folder,'inventory-before.json'),inventory,{flag:'wx'});
const eligible=r=>typeof r.lot==='string'&&r.lot.trim()!==''&&Number.isInteger(r.plantingYear);
console.log(JSON.stringify({backup:folder,snapshotHash:hash,master:{before:parsed.records.length,after:parsed.records.filter(eligible).length},inventory:{before:JSON.parse(inventory).rows.length,after:JSON.parse(inventory).rows.filter(eligible).length}}));
