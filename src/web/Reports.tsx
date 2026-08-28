import {useEffect,useRef,useState} from 'react';
import {ApiError,errorText,rpc,type Master} from './api';
import {dates,type BoardState} from './gantt-model';
import {backupEnvelope,downloadText,reportCsv,type ExportResult} from './export-model';
type Capacity={databaseBytes:number;snapshotCount:number;snapshotBytes:number;inventoryVersions:number;inventoryBytes:number;syncRunsMonth:number;syncErrorsMonth:number;downloadedBytesMonth:number;snapshotSentBytesMonth:number;guards:{databaseBytes:number;snapshotCount:number;snapshotBytes:number}};
const mib=(n:number)=>(n/1048576).toLocaleString('es-CO',{maximumFractionDigits:2})+' MiB';
export function Reports({master,state,onChange,onDenied,onGantt}:{master:Master;state:BoardState;onChange:(s:BoardState)=>void;onDenied:()=>void;onGantt:()=>void}){
 const [capacity,setCapacity]=useState<Capacity|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0);
 const active=useRef<AbortController|null>(null);
 useEffect(()=>{const c=new AbortController();setCapacity(null);void rpc<Capacity>('web6_capacity',{},c.signal).then(v=>{if(!c.signal.aborted)setCapacity(v)}).catch(e=>{if(!c.signal.aborted){if(e instanceof ApiError&&e.code==='ACCESS_DENIED')onDenied();else setError(errorText(e))}});return()=>c.abort()},[attempt,onDenied]);
 useEffect(()=>()=>active.current?.abort(),[]);
 async function run(kind:'control'|'gantt'|'backup'){
  if(busy)return;const c=new AbortController();active.current=c;setBusy(true);setError('');setMessage('');
  try{
   if(kind==='backup'){
    const data=await rpc('web6_backup',{},c.signal);const text=await backupEnvelope(data);
    if(c.signal.aborted)return;
    downloadText(text,`arles-respaldo-${new Date().toISOString().replaceAll(':','-')}.json`,'application/json');
    setMessage('Descarga solicitada. Comprueba que el archivo quedó guardado y copia el respaldo a una ubicación externa privada.');
   }else{
    const result=await rpc<ExportResult>('web6_export',{p_snapshot:master.snapshotHash,p_from:state.from,p_to:state.to,p_filters:state.filters,p_kind:kind},c.signal);
    if(c.signal.aborted)return;
    downloadText(reportCsv(result),`arles-${kind}-${state.from}-${state.to}.csv`,'text/csv;charset=utf-8');
    setMessage(`Exportación completa: ${result.totalRecords} registros fuente. No se limita a la página visible.`);
   }
  }catch(e){if(!c.signal.aborted){if(e instanceof ApiError&&e.code==='ACCESS_DENIED')onDenied();else setError(errorText(e))}}finally{if(!c.signal.aborted)setBusy(false)}
 }
 const warning=capacity&&(capacity.databaseBytes>=capacity.guards.databaseBytes*.8||capacity.snapshotBytes>=capacity.guards.snapshotBytes*.8||capacity.snapshotCount>=80);
 return <div className="stack"><section className="panel"><span className="eyebrow">WEB 6 · Exportación privada</span><h2>Reportes del control y Gantt</h2><p className="muted">CSV para abrir en Excel. Comparte el periodo y los filtros del Gantt. El control incluye bloqueados con fecha; el Gantt solo actividad representable. Los días sin registros quedan vacíos, no significan cero trabajo.</p>
  <div className="filters"><label>Desde<input type="date" disabled={busy} value={state.from} onChange={e=>onChange({...state,mode:'range',from:e.target.value})}/></label><label>Hasta<input type="date" disabled={busy} value={state.to} onChange={e=>onChange({...state,mode:'range',to:e.target.value})}/></label><button className="secondary" disabled={busy} onClick={onGantt}>Cambiar filtros en Gantt</button></div>
  <p>Filtros: {Object.entries(state.filters).map(([key,value])=>`${key}: ${value}`).join(' · ')||'Todos'}</p>
  {!dates(state.from,state.to).length&&<p className="notice">Selecciona un periodo válido de hasta 93 días.</p>}
  <div className="filters"><button className="primary" disabled={busy||!dates(state.from,state.to).length} onClick={()=>void run('control')}>Exportar control CSV</button><button className="secondary" disabled={busy||!dates(state.from,state.to).length} onClick={()=>void run('gantt')}>Exportar Gantt CSV</button></div>
  <p className="muted">No se exportan filas sin lote/año. Filas sin fecha no pertenecen a un periodo. Máximo 20.000 registros por reporte; si se supera, se pide reducir filtros sin entregar un archivo incompleto.</p>
 </section><section className="panel"><h2>Respaldo recuperable</h2><p>Incluye todas las versiones guardadas del maestro, inventarios, fechas de confirmación y configuración funcional. Sin tokens, contraseñas ni sesiones. La planificación editable aún no existe.</p><p className="notice">El archivo contiene datos privados sin cifrar. Guárdalo fuera de Supabase y no lo subas al repositorio público. La descarga no configura respaldos automáticos.</p><button className="primary" disabled={busy} onClick={()=>void run('backup')}>Descargar respaldo JSON</button><p className="muted">Incluye huella SHA-256 para comprobar integridad. Límite preventivo de 32 MiB; nunca se descarga una copia parcial. Restaurar exige revisión técnica, recrear el acceso y reconectar Google. No se restaura encima de producción desde esta pantalla.</p></section>
 {busy&&<p role="status">Preparando archivo privado…</p>}{message&&<p className="notice" role="status">{message}</p>}{error&&<p className="notice error" role="alert">{error}</p>}
 <section className="panel"><div className="panel-heading"><h2>Capacidad y revisiones</h2><button className="secondary" onClick={()=>{setError('');setAttempt(n=>n+1)}}>Actualizar métricas</button></div>{warning&&<p role="alert" className="notice">Se alcanzó el 80% de una guardia local. Revisa respaldos y retención antes de alcanzar el límite. No se borrará historial ni se contratará un plan automáticamente.</p>}{capacity?<><div className="metrics">{[['Base de datos',mib(capacity.databaseBytes)],['Historial del maestro',`${capacity.snapshotCount} versiones · ${mib(capacity.snapshotBytes)}`],['Inventario',`${capacity.inventoryVersions} versiones · ${mib(capacity.inventoryBytes)}`],['Revisiones este mes',capacity.syncRunsMonth.toLocaleString('es-CO')]].map(([label,n])=><article className="metric" key={label}><span>{label}</span><strong>{n}</strong></article>)}</div><p>{capacity.syncErrorsMonth} revisiones con error este mes. Transferencia parcial registrada: {mib(capacity.downloadedBytesMonth)} descargados de Drive y {mib(capacity.snapshotSentBytesMonth)} de payload hacia la base.</p><p className="muted">No son cifras de facturación: no incluyen navegación, OAuth, respaldos, otras funciones ni tráfico fallido no medido. Las cuotas reales se consultan en el proveedor. Guardias locales: 400 MiB de base, 100 versiones y 100 MiB de snapshots.</p></>:<p>Consultando métricas…</p>}<p className="notice">Retención: sin borrado automático. Destino, custodio y frecuencia de copias automáticas pendientes de aprobación.</p></section></div>;
}
