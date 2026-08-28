import {dates} from './gantt-model';
export type ExportResult={kind:'control'|'gantt';snapshotHash:string;from:string;to:string;filters:Record<string,string>;generatedAt:string;totalRecords:number;rows:Record<string,unknown>[]};
// Neutraliza fórmulas de hojas de cálculo sin interpretar contenido del maestro.
export function csvCell(value:unknown){let s=String(value??'');if(/^[\s\uFEFF]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
export function reportCsv(report:ExportResult){
 let rows:unknown[][];
 if(report.kind==='control'){
  const fields=['workDate','lot','plantingYear','labor','collaborator','input','quantityRaw','unit','dose','machinery','observation','validationState','sourceSheet','sourceRow'];
  rows=[['Fecha','Lote','Año de siembra','Labor','Colaborador','Insumo','Cantidad original','Unidad','Dosis','Maquinaria','Observación','Validación','Hoja','Fila','Versión del maestro'],...report.rows.map(r=>[...fields.map(f=>r[f]),report.snapshotHash])];
 }else{
  const days=dates(report.from,report.to),groups=new Map<string,{lot:unknown;labor:unknown;cells:Map<string,unknown>}>();
  for(const r of report.rows){const key=JSON.stringify([r.lot,r.labor]);let g=groups.get(key);if(!g){g={lot:r.lot,labor:r.labor,cells:new Map()};groups.set(key,g)}g.cells.set(String(r.date),r.records)}
  rows=[['Lote','Labor',...days,'Versión del maestro'],...Array.from(groups.values(),g=>[g.lot,g.labor,...days.map(d=>g.cells.get(d)??''),report.snapshotHash])];
 }
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
}
export async function backupEnvelope(data:unknown){
 const payload=JSON.stringify(data),bytes=new TextEncoder().encode(payload);
 if(bytes.length>33554432)throw new Error('BACKUP_LIMIT');
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return JSON.stringify({format:'arles-backup-envelope-v1',sha256:Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join(''),payload});
}
export function downloadText(text:string,name:string,type:string){
 const url=URL.createObjectURL(new Blob([text],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
