// Solo lectura del XLSX; los datos derivados quedan en .private, nunca en Git.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import readXlsxFile from 'read-excel-file/node';
import {unzipSync,strFromU8} from 'fflate';
import {applyInventoryPolicy} from '../src/importer/inventory-policy.mjs';
const root=path.resolve(import.meta.dirname,'..');
const source='C:/Users/Almacen/Pictures/Inventario general Arles.xlsx';
const bytes=await fs.readFile(source),hash=createHash('sha256').update(bytes).digest('hex');
const sheets=await readXlsxFile(bytes,{trim:false});
if(sheets.length!==1||sheets[0].sheet!=='Hoja1')throw new Error('INVENTORY_STRUCTURE_CHANGED');
const sheet=sheets[0],data=sheet.data;
if(data[6]?.[1]!=='LOTE'||data[6]?.[2]!=='SIEMBRA'||data[7]?.[8]!=='VIVOS'||data[7]?.[11]!=='Total de plantas vivas'||data.length!==68)throw new Error('INVENTORY_STRUCTURE_CHANGED');
const zip=unzipSync(new Uint8Array(bytes)),xml=strFromU8(zip['xl/worksheets/sheet1.xml']);
const formulas={};
for(const match of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)){
 const address=match[1].match(/\br="([A-Z]+\d+)"/)?.[1];
 const formula=match[2].match(/<f\b[^>]*(?:\/>|>[\s\S]*?<\/f>)/)?.[0];
 if(address&&formula)formulas[address]=formula;
}
const names=['lot','plantingYear','area','areaAlqueria','difference','trees','productionTrees','alive','dead','replanted','totalAlive'];
const rows=[];
for(let i=8;i<65;i++){
 const raw=data[i];if(!String(raw[1]??'').trim()||!Number.isInteger(raw[2]))continue;
 const row={ordinal:rows.length+1,sourceSheet:sheet.sheet,sourceRow:i+1,rawValues:raw,formulas:{},issues:[]};
 names.forEach((name,j)=>row[name]=name==='lot'?String(raw[j+1]):raw[j+1]);
 for(const [cell,formula] of Object.entries(formulas))if(Number(cell.match(/\d+/)[0])===i+1)row.formulas[cell]=formula;
 if(row.plantingYear===null)row.issues.push('Año de siembra no informado');
 if(row.area===null||typeof row.area!=='number')row.issues.push('Área principal ausente o pendiente');
 if(row.totalAlive===null)row.issues.push('Total de plantas vivas no informado');
 for(const field of ['trees','productionTrees','alive','dead','replanted','totalAlive'])if(row[field]!==null&&(typeof row[field]!=='number'||row[field]<0||!Number.isInteger(row[field])))row.issues.push(`Revisar ${field}`);
 if(typeof row.totalAlive==='number'&&typeof row.alive==='number'&&typeof row.replanted==='number'&&row.totalAlive!==row.alive+row.replanted)row.issues.push('Total de vivas no coincide con vivos más resiembra');
 row.state=row.issues.length?'REVIEW':'VALID';rows.push(row);
}
const sum=field=>rows.reduce((total,r)=>total+(typeof r[field]==='number'?r[field]:0),0);
const sourceTotals={area:data[65][3],areaAlqueria:data[65][4],difference:data[65][5],totalAlive:data[66][11],planted:data[67][6]};
const calculated={area:sum('area'),areaAlqueria:sum('areaAlqueria'),totalAlive:sum('totalAlive'),planted:sum('trees')};
const reconciliation=Object.keys(calculated).map(field=>({field,source:sourceTotals[field],sumOfNumericRows:calculated[field],matches:Math.abs(sourceTotals[field]-calculated[field])<0.000001}));
const payload=applyInventoryPolicy({schema:'arles-inventory-v1',fileName:path.basename(source),fileHash:hash,importedAt:new Date().toISOString(),
 title:data[3][1],periodLabel:data[6][8],sourceSheet:sheet.sheet,headerRows:[7,8],rows,
 sourceTotals,calculated,reconciliation,totalsRows:data.slice(65),formulas,
 summary:{rows:rows.length,review:rows.filter(r=>r.state==='REVIEW').length,formulaCells:Object.keys(formulas).length},
 warnings:['Fecha efectiva no confirmada: no usar como inventario vigente ni para cálculos históricos.',
 'Celdas vacías y textos pendientes se conservan; no se convierten en ceros.',
 'Resultados de fórmulas son valores guardados por Excel, no recalculados por la web.',
 ...reconciliation.filter(r=>!r.matches).map(r=>`El total de ${r.field} no coincide con la suma de las filas numéricas.`)]});
const folder=path.join(root,'.private/inventory');await fs.mkdir(folder,{recursive:true});
const delimiter='$inventory_'+hash.slice(0,16)+'$';const json=JSON.stringify(payload);
if(json.includes(delimiter))throw new Error('UNSAFE_DELIMITER');
await fs.writeFile(path.join(folder,'initial.json'),json);
await fs.writeFile(path.join(folder,'stage-initial.sql'),`begin;\nselect public.web5_stage_inventory(${delimiter}${json}${delimiter}::jsonb);\ncommit;\n`);
const verified=createHash('sha256').update(await fs.readFile(source)).digest('hex');if(verified!==hash)throw new Error('SOURCE_CHANGED');
console.log(JSON.stringify({sourceUnchanged:true,fileHash:hash,...payload.summary,includedTotals:payload.includedTotals,status:'DRAFT',effectiveDate:null}));
