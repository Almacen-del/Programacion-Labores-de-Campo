import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { SyncHealth } from './SyncHealth';
import { Gantt } from './Gantt';
import { initialBoard } from './gantt-model';
import { syncErrorText, isStale } from './sync-status';
import { ApiError, rpc, errorText, type Bootstrap, type Master, type RecordRow, type AlertRow, type Page, type HistoryData } from './api';

const modules=[
  {id:'control',title:'Cuadro de Control',label:'Control',glyph:'◈'},
  {id:'gantt',title:'Gantt por lote y labor',label:'Gantt',glyph:'▤'},
  {id:'records',title:'Registros del maestro',label:'Registros',glyph:'◫'},
  {id:'lots',title:'Detalle por lote',label:'Lotes',glyph:'⌂'},
  {id:'indicators',title:'Indicadores',label:'Indicadores',glyph:'◔'},
  {id:'inventory',title:'Inventario general',label:'Inventario',glyph:'▣',stage:5},
  {id:'alerts',title:'Alertas de datos',label:'Alertas',glyph:'△'},
  {id:'reports',title:'Reportes',label:'Reportes',glyph:'▧',stage:6},
  {id:'sync',title:'Sincronización del maestro',label:'Sincronización',glyph:'↻'},
  {id:'settings',title:'Mi acceso',label:'Mi acceso',glyph:'⚙'}
] as const;
type ModuleId=typeof modules[number]['id'];
type Denied=()=>void;
const number=(n:number|undefined)=>n===undefined?'—':n.toLocaleString('es-CO');
export function dateTime(value:string|null){
  if(!value)return 'Sin registro';
  const date=new Date(value);if(Number.isNaN(date.getTime()))return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Bogota'}).format(date);
}
function workDate(value:string|null){return value?value.split('-').reverse().join('/'):'Sin fecha'}
function useRead<T>(name:string|null,args:Record<string,unknown>,onDenied:Denied,revision?:string|null){
  const [result,setResult]=useState<T|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[attempt,setAttempt]=useState(0);
  const key=JSON.stringify(args);
  useEffect(()=>{
    setResult(null);setError('');if(!name)return;
    const controller=new AbortController();setLoading(true);
    void rpc<T>(name,JSON.parse(key),controller.signal).then(value=>{if(!controller.signal.aborted)setResult(value)}).catch(reason=>{
      if(controller.signal.aborted)return;
      if(reason instanceof ApiError && reason.code==='ACCESS_DENIED'){onDenied();return}
      setError(errorText(reason));
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return ()=>controller.abort();
  },[name,key,attempt,onDenied,revision]);
  return {result,error,loading,retry:()=>setAttempt(v=>v+1)};
}
function Feedback({error,loading,retry}:{error:string;loading:boolean;retry:()=>void}){
  if(error)return <div role="alert" className="notice error">{error} <button className="text-button" onClick={retry}>Reintentar consulta</button></div>;
  return loading?<p className="loading" role="status">Consultando datos privados…</p>:null;
}
function Metric({label,value,detail,tone=''}:{label:string;value:number|undefined;detail:string;tone?:string}){return <article className={`metric ${tone}`}><span>{label}</span><strong>{number(value)}</strong><small>{detail}</small></article>}
function State({state}:{state:string}){return <span className={`state state-${state.toLowerCase()}`}>{({VALID:'Válido',OBSERVED:'Observado',BLOCKED:'Bloqueado',BLOCKING:'Bloqueante',WARNING:'Advertencia',INFO:'Información',UPDATED:'Actualizado',UNCHANGED:'Sin cambios',ERROR:'Error',RUNNING:'En curso'} as Record<string,string>)[state]??'Sin clasificar'}</span>}
function Pagination({offset,total,onChange}:{offset:number;total:number;onChange:(n:number)=>void}){return <div className="pagination"><span>{total?`${number(offset+1)}–${number(Math.min(offset+50,total))} de ${number(total)}`:'Sin resultados'}</span><div><button className="secondary" disabled={offset===0} onClick={()=>onChange(Math.max(0,offset-50))}>Anterior</button><button className="secondary" disabled={offset+50>=total} onClick={()=>onChange(offset+50)}>Siguiente</button></div></div>}
function SourceFacts({master}:{master:Master}){return <dl className="facts"><div><dt>Archivo maestro</dt><dd>{master.fileName}</dd></div><div><dt>Versión importada</dt><dd>{dateTime(master.importedAt)}</dd></div><div><dt>Última revisión en servidor</dt><dd>{dateTime(master.lastCheckedAt)}</dd></div><div><dt>Último cambio en Drive</dt><dd>{dateTime(master.sourceModifiedAt)}</dd></div></dl>}
function Overview({master,onNavigate}:{master:Master;onNavigate:(id:ModuleId)=>void}){return <>
  <section className="hero"><span className="eyebrow">Fuente principal · Google Drive</span><h2>La información del campo,<br/>en un solo lugar.</h2><p>Consulta el maestro vigente y sus observaciones. Cada registro mantiene su hoja y fila de origen; esta web no modifica el archivo de Drive.</p><button className="secondary hero-action" onClick={()=>onNavigate('records')}>Consultar registros <span aria-hidden="true">→</span></button></section>
  <section className="metrics" aria-label="Resumen de la versión vigente"><Metric label="Registros del maestro" value={master.summary?.total} detail="Todas las filas conservadas"/><Metric label="Datos válidos" value={master.summary?.valid} detail="Sin hallazgos de validación" tone="good"/><Metric label="Con observaciones" value={master.summary?.observed} detail="Requieren revisión" tone="warning"/><Metric label="Bloqueados" value={master.summary?.blocked} detail="Excluidos de futuros cálculos" tone="danger"/></section>
  <div className="content-grid"><section className="panel"><span className="eyebrow">Trazabilidad</span><h3>La versión que estás consultando</h3><SourceFacts master={master}/></section><section className="panel"><span className="eyebrow">Calidad de datos</span><h3>{number(master.summary?.alerts)} alertas</h3><p className="muted">Los hallazgos se muestran sin corregir ni eliminar silenciosamente la información del maestro. Una fila puede tener varias alertas.</p><button className="secondary" onClick={()=>onNavigate('alerts')}>Revisar alertas</button></section></div>
</>}
function Records({master,onDenied,onDetail}:{master:Master;onDenied:Denied;onDetail:(n:number)=>void}){
  const [offset,setOffset]=useState(0),[draft,setDraft]=useState({from:'',to:'',lot:'',labor:'',state:''}),[filters,setFilters]=useState(draft);
  const options=useRead<{lots:string[];labors:string[]}>('web2_filters',{},onDenied,master.snapshotHash);
  const page=useRead<Page<RecordRow>>('web2_records',{p_snapshot:master.snapshotHash,p_offset:offset,p_limit:50,p_from:filters.from||null,p_to:filters.to||null,p_lot:filters.lot||null,p_labor:filters.labor||null,p_state:filters.state||null},onDenied);
  useEffect(()=>setOffset(0),[master.snapshotHash]);
  const rangeInvalid=Boolean(draft.from && draft.to && draft.from>draft.to);
  return <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Consulta de solo lectura</span><h2>Registros de labores</h2></div><span className="pill">Hoja y fila verificables</span></div><p className="muted">Las fechas filtran la labor registrada, no la fecha de sincronización. Selecciona «Ver» para revisar el origen completo.</p>
    <form className="filters" onSubmit={event=>{event.preventDefault();if(!rangeInvalid){setOffset(0);setFilters({...draft})}}}>
      <label>Desde<input type="date" value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label><label>Hasta<input type="date" value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label>
      <label>Lote<select value={draft.lot} onChange={e=>setDraft({...draft,lot:e.target.value})}><option value="">Todos los lotes</option>{options.result?.lots.map(lot=><option key={lot}>{lot}</option>)}</select></label>
      <label>Labor<select value={draft.labor} onChange={e=>setDraft({...draft,labor:e.target.value})}><option value="">Todas las labores</option>{options.result?.labors.map(labor=><option key={labor}>{labor}</option>)}</select></label>
      <label>Validación<select value={draft.state} onChange={e=>setDraft({...draft,state:e.target.value})}><option value="">Todos los estados</option><option value="VALID">Válidos</option><option value="OBSERVED">Observados</option><option value="BLOCKED">Bloqueados</option></select></label>
      <button className="primary" disabled={rangeInvalid}>Aplicar filtros</button><button className="text-button" type="button" onClick={()=>{const empty={from:'',to:'',lot:'',labor:'',state:''};setDraft(empty);setFilters(empty);setOffset(0)}}>Limpiar</button>
    </form>{rangeInvalid&&<p role="alert" className="notice">La fecha inicial no puede ser posterior a la final.</p>}<Feedback {...options}/><Feedback {...page}/>
    {page.result&&<><div className="table-wrap" tabIndex={0} aria-label="Tabla de registros"><table><thead><tr><th>Fecha</th><th>Lote / labor</th><th>Colaborador</th><th>Cantidad</th><th>Estado</th><th>Origen</th><th>Detalle</th></tr></thead><tbody>{page.result.rows.map(row=><tr key={row.ordinal}><td>{workDate(row.workDate)}</td><td><strong>{row.lot??'Sin lote'}</strong><small>{row.labor??'Sin labor'}</small></td><td>{row.collaborator??'—'}</td><td>{row.quantityRaw??row.quantity??'—'}<small>{row.unit??'Sin unidad'}</small></td><td><State state={row.validationState}/></td><td>{row.sourceSheet}<small>Fila {row.sourceRow}</small></td><td><button className="text-button" onClick={()=>onDetail(row.ordinal)} aria-label={`Ver registro ${row.ordinal}`}>Ver ↗</button></td></tr>)}</tbody></table></div>{!page.result.total&&<p className="empty-state">No hay registros que coincidan con estos filtros.</p>}<Pagination offset={offset} total={page.result.total} onChange={setOffset}/></>}
  </section>;
}
function Alerts({master,onDenied,onDetail}:{master:Master;onDenied:Denied;onDetail:(n:number)=>void}){
  const [offset,setOffset]=useState(0);
  const page=useRead<Page<AlertRow>>('web2_alerts',{p_snapshot:master.snapshotHash,p_offset:offset,p_limit:50},onDenied);
  useEffect(()=>setOffset(0),[master.snapshotHash]);
  return <section className="panel"><span className="eyebrow">Calidad del maestro</span><h2>Hallazgos con origen visible</h2><p className="muted">Las correcciones se realizan en el maestro. Esta pantalla permite identificar la hoja y fila que requieren revisión.</p><Feedback {...page}/>{page.result&&<><div className="table-wrap" tabIndex={0} aria-label="Tabla de alertas"><table><thead><tr><th>Nivel</th><th>Hallazgo</th><th>Lote / labor</th><th>Origen</th></tr></thead><tbody>{page.result.rows.map(row=><tr key={`${row.recordOrdinal}-${row.ordinal}`}><td><State state={row.severity}/></td><td><strong>{row.code}</strong><small>{row.message}</small></td><td>{row.lot??'Sin lote'}<small>{row.labor??'Sin labor'}</small></td><td><button className="text-button" onClick={()=>onDetail(row.recordOrdinal)}>{row.sourceSheet} · fila {row.sourceRow}</button></td></tr>)}</tbody></table></div>{!page.result.total&&<p className="empty-state">La versión vigente no tiene alertas registradas.</p>}<Pagination offset={offset} total={page.result.total} onChange={setOffset}/></>}</section>;
}
function Synchronization({master,onDenied}:{master:Master;onDenied:Denied}){
  const history=useRead<HistoryData>('web2_history',{},onDenied,master.lastCheckedAt);
  return <div className="stack"><section className="panel"><span className="eyebrow">Sin importación manual</span><h2>Revisión automática cada cinco minutos</h2><p className="muted">El servidor comprueba el archivo incluso con la página cerrada. Si no cambió, no descarga ni crea otra versión. Si hay un error, conserva la última versión válida.</p><SourceFacts master={master}/><div className="notice">La conexión de Drive continúa en modo de prueba. Su renovación definitiva y la política de retención están pendientes antes del uso permanente.</div></section><section className="panel"><span className="eyebrow">Historial consultable</span><h2>Versiones y últimas revisiones</h2><Feedback {...history}/>{history.result&&<><h3>Versiones guardadas</h3><div className="table-wrap"><table><thead><tr><th>Importada</th><th>Registros</th><th>Alertas</th><th>Identificador</th></tr></thead><tbody>{history.result.versions.map(v=><tr key={v.snapshot_hash}><td>{dateTime(v.created_at)}</td><td>{number(v.summary.total)}</td><td>{number(v.summary.alerts)}</td><td><code>{v.snapshot_hash.slice(0,12)}</code></td></tr>)}</tbody></table></div><h3 className="section-heading">Últimas 20 ejecuciones</h3><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Resultado</th><th>Observación</th></tr></thead><tbody>{history.result.runs.map(run=><tr key={run.id}><td>{dateTime(run.started_at)}</td><td><State state={run.status}/></td><td>{run.error_code?syncErrorText(run.error_code):(run.status==='UNCHANGED'?'Sin nueva descarga':'—')}</td></tr>)}</tbody></table></div></>}</section></div>;
}
function Detail({snapshot,ordinal,onDenied,onClose}:{snapshot:string|null;ordinal:number;onDenied:Denied;onClose:()=>void}){
  const modal=useRef<HTMLDialogElement>(null);
  const query=useRead<RecordRow|null>('web2_record',{p_snapshot:snapshot,p_ordinal:ordinal},onDenied);
  useEffect(()=>{modal.current?.showModal();return ()=>modal.current?.close()},[]);
  const row=query.result;
  return <dialog ref={modal} className="detail-dialog" aria-labelledby="detail-title" onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose()}}><div className="detail-inner"><div className="panel-heading"><div><span className="eyebrow">Trazabilidad del maestro</span><h2 id="detail-title">Detalle del registro</h2></div><button className="secondary" onClick={onClose} autoFocus aria-label="Cerrar detalle">Cerrar ×</button></div><Feedback {...query}/>{row&&<><State state={row.validationState}/><dl className="facts detail-facts">{[
    ['Fecha',workDate(row.workDate)],['Lote',row.lot],['Labor',row.labor],['Colaborador',row.collaborator],['Año de siembra',row.plantingYear],['Insumo',row.input],['Cantidad',row.quantityRaw??row.quantity],['Unidad',row.unit],['Dosis',row.dose],['Maquinaria',row.machinery],['Observación',row.observation],['Origen',`${row.sourceSheet} · fila ${row.sourceRow}`]
  ].map(([label,value])=><div key={String(label)}><dt>{label}</dt><dd>{value??'—'}</dd></div>)}</dl>{row.alerts.length>0&&<section><h3>Alertas del registro</h3>{row.alerts.map((a,i)=><p className="notice" key={i}><strong>{a.code}</strong> · {a.message}</p>)}</section>}<details><summary>Ver valores originales de la fila</summary><pre>{JSON.stringify(row.rawValues??[],null,2)}</pre></details></>}{!query.loading&&!query.error&&!row&&<p>No se encontró este registro en la versión consultada.</p>}</div></dialog>;
}
export function Workspace({initial,brand,onLogout,onDenied}:{initial:Bootstrap;brand:ReactNode;onLogout:()=>void;onDenied:Denied}){
  const [board,setBoard]=useState(initialBoard);
  const [now,setNow]=useState(Date.now());
  const [data,setData]=useState(initial),[notice,setNotice]=useState(''),[refreshing,setRefreshing]=useState(false),[moduleId,setModule]=useState<ModuleId>('control'),[detail,setDetail]=useState<number|null>(null);
  const inFlight=useRef(false),controller=useRef<AbortController|null>(null);
  const refresh=useCallback(async()=>{
    if(inFlight.current)return;
    inFlight.current=true;setRefreshing(true);setNow(Date.now());const request=new AbortController();controller.current=request;
    try{const next=await rpc<Bootstrap>('web2_bootstrap',{},request.signal);if(!request.signal.aborted){setData(next);setNotice('')}}
    catch(error){if(!request.signal.aborted){if(error instanceof ApiError&&error.code==='ACCESS_DENIED'){onDenied();return}setNotice(errorText(error)+' Los datos mostrados corresponden a la última consulta correcta.')}}
    finally{inFlight.current=false;if(!request.signal.aborted)setRefreshing(false)}
  },[onDenied]);
  useEffect(()=>{
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh()},60000);
    const visible=()=>{if(document.visibilityState==='visible')void refresh()};document.addEventListener('visibilitychange',visible);
    return ()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);controller.current?.abort()};
  },[refresh]);
  useEffect(()=>setDetail(null),[data.master.snapshotHash]);
  const master=data.master,current=modules.find(m=>m.id===moduleId)!;
  const stale=isStale(master.lastCheckedAt,now);
  const syncLabel=master.lastError?'Sincronización con error':stale?'Revisión pendiente':'Maestro conectado';
  let content:ReactNode;
  if(moduleId==='control')content=<Overview master={master} onNavigate={setModule}/>;
  else if(moduleId==='gantt'||moduleId==='lots'||moduleId==='indicators')content=<Gantt master={master} state={board} onChange={setBoard} onDenied={onDenied} onDetail={setDetail} view={moduleId}/>;
  else if(moduleId==='records')content=<Records master={master} onDenied={onDenied} onDetail={setDetail}/>;
  else if(moduleId==='alerts')content=<Alerts master={master} onDenied={onDenied} onDetail={setDetail}/>;
  else if(moduleId==='sync')content=<div className="stack"><SyncHealth master={master} onDenied={onDenied}/><Synchronization master={master} onDenied={onDenied}/></div>;
  else if(moduleId==='settings')content=<section className="panel"><span className="eyebrow">Cuenta y privacidad</span><h2>Tu acceso a Arles</h2><dl className="facts"><div><dt>Cuenta actual</dt><dd>{data.member.email}</dd></div><div><dt>Tipo de acceso</dt><dd>{data.member.role==='TEST_ADMIN'?'Administrador temporal de pruebas':'Ingeniero · usuario definitivo'}</dd></div><div><dt>Permisos en esta etapa</dt><dd>Consulta privada. Sin edición del maestro. Reconexión de Drive solo por la cuenta temporal autorizada.</dd></div><div><dt>Sesión</dt><dd>Se mantiene en esta pestaña. Usa «Cerrar sesión» al terminar en un equipo compartido.</dd></div></dl><button className="secondary" onClick={onLogout}>Cerrar sesión</button></section>;
  else content=<section className="panel upcoming"><span className="upcoming-glyph" aria-hidden="true">{current.glyph}</span><span className="eyebrow">Etapa WEB {'stage' in current?current.stage:'posterior'}</span><h2>{current.title}</h2><p>{moduleId==='inventory'?'El inventario tendrá su propia pestaña como maestro secundario. Su carga y método de actualización se implementarán en WEB 5.':'Este módulo conserva su lugar en la navegación. Sus funciones se implementarán en la etapa correspondiente, sin presentar datos de demostración como resultados reales.'}</p><span className="pill pending">Pendiente de implementación</span><button className="secondary" onClick={()=>setModule('records')}>Consultar los registros disponibles</button></section>;
  return <div className="app-shell"><aside className="sidebar">{brand}<p className="sidebar-note">Espacio de trabajo</p><nav aria-label="Módulos principales">{modules.map(m=><button key={m.id} className={`nav-item ${moduleId===m.id?'active':''}`} aria-current={moduleId===m.id?'page':undefined} onClick={()=>setModule(m.id)}><span aria-hidden="true">{m.glyph}</span>{m.label}{'stage' in m&&<span className="nav-pending" aria-label="Pendiente">·</span>}</button>)}</nav><div className="account"><span>{data.member.email}</span><small>{data.member.role==='TEST_ADMIN'?'Acceso temporal de pruebas':'Usuario definitivo'}</small><button onClick={onLogout}>Cerrar sesión ↗</button></div></aside><main id="main"><header className="topbar"><div><span className="eyebrow">Control de labores agrícolas</span><h1>{current.title}</h1></div><div className="topbar-status"><span className={`pill ${master.lastError||stale?'pending':''}`}>{syncLabel}</span><button className="text-button" onClick={()=>void refresh()} disabled={refreshing}>{refreshing?'Consultando…':'Actualizar consulta'}</button></div></header><div className="page-content">{notice&&<div className="notice error" role="alert">{notice}</div>}{master.lastError&&<div className="notice" role="status">{syncErrorText(master.lastError)} Se conserva la versión importada el {dateTime(master.importedAt)}.</div>}{stale&&!master.lastError&&<div className="notice" role="status">No hay una revisión reciente del servidor. Los datos pueden estar desactualizados. Última revisión: {dateTime(master.lastCheckedAt)}.</div>}{content}<footer className="workspace-footer"><span>WEB 4 · Gantt de ejecución</span><span>Hora de Colombia · Última revisión {dateTime(master.lastCheckedAt)}</span></footer></div></main>{detail!==null&&<Detail snapshot={master.snapshotHash} ordinal={detail} onDenied={onDenied} onClose={()=>setDetail(null)}/>}</div>;
}
