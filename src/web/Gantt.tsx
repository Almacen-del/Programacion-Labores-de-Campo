import {useEffect,useRef,useState} from 'react';
import {ApiError,errorText,rpc,type Master,type RecordRow,type Page} from './api';
import {dates,today,period,movePeriod,laborColor,dateLabel,type BoardState,type Mode} from './gantt-model';
import './gantt.css';
type Cell={date:string;records:number;observed:boolean};
type Group={lot:string;labor:string;records:number;active_days:number;days:Cell[]};
type Result={snapshotHash:string;totalGroups:number;rows:Group[];metrics:{records:number;lots:number;labors:number;activeDays:number;observed:number;excluded:number;undated:number}};
type Options={latest:string|null;earliest:string|null;fields:Record<string,string[]>|null};
type Selection={lot:string;labor:string;date:string};
const fields=[['lot','Lote'],['labor','Labor'],['plantingYear','Año de siembra'],['collaborator','Colaborador'],['input','Insumo'],['machinery','Maquinaria'],['sourceSheet','Hoja de origen']] as const;
function useLoad<T>(name:string,args:Record<string,unknown>,onDenied:()=>void){
 const key=JSON.stringify(args),[loaded,setLoaded]=useState<{key:string;value:T}|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{const abort=new AbortController();setError('');
  void rpc<T>(name,JSON.parse(key),abort.signal).then(value=>{if(!abort.signal.aborted)setLoaded({key,value})}).catch(e=>{
   if(abort.signal.aborted)return;if(e instanceof ApiError&&e.code==='ACCESS_DENIED')onDenied();else setError(errorText(e));
  });return()=>abort.abort();
 },[name,key,attempt,onDenied]);
 return {value:loaded?.key===key?loaded.value:null,error,retry:()=>setAttempt(n=>n+1)};
}
function LoadMessage({error,retry}:{error:string;retry:()=>void}){return error?<p className="notice error" role="alert">{error} <button className="text-button" onClick={retry}>Reintentar</button></p>:<p role="status" className="loading">Consultando actividad del maestro…</p>}
function Pager({offset,total,size,onChange}:{offset:number;total:number;size:number;onChange:(n:number)=>void}){return <div className="pagination"><span>{total?`${offset+1}–${Math.min(total,offset+size)} de ${total}`:'Sin resultados'}</span><div><button className="secondary" disabled={!offset} onClick={()=>onChange(Math.max(0,offset-size))}>Anterior</button><button className="secondary" disabled={offset+size>=total} onClick={()=>onChange(offset+size)}>Siguiente</button></div></div>}
function DayDetail({selection,master,state,onDenied,onDetail,onClose}:{selection:Selection;master:Master;state:BoardState;onDenied:()=>void;onDetail:(id:number)=>void;onClose:()=>void}){
 const [offset,setOffset]=useState(0),region=useRef<HTMLElement>(null);
 const query=useLoad<Page<RecordRow>>('web4_gantt_detail',{p_snapshot:master.snapshotHash,p_day:selection.date,p_lot:selection.lot,p_labor:selection.labor,p_filters:state.filters,p_offset:offset},onDenied);
 useEffect(()=>{region.current?.focus();region.current?.scrollIntoView({block:'nearest'})},[]);
 return <section className="panel gantt-detail" ref={region} tabIndex={-1} aria-label="Registros de la barra"><div className="panel-heading"><div><span className="eyebrow">Evidencia de ejecución</span><h2>{selection.lot} · {selection.labor}</h2><p>{dateLabel(selection.date)}</p></div><button className="secondary" onClick={onClose}>Cerrar selección</button></div>
  {!query.value?<LoadMessage {...query}/>:<><div className="table-wrap"><table><caption>Registros fuente del día seleccionado</caption><thead><tr><th>Colaborador</th><th>Cantidad / unidad</th><th>Estado</th><th>Origen verificable</th></tr></thead><tbody>{query.value.rows.map(r=><tr key={r.ordinal}><td>{r.collaborator??'Sin colaborador'}</td><td>{r.quantityRaw??r.quantity??'—'}<small>{r.unit??'Sin unidad'}</small></td><td>{r.validationState==='OBSERVED'?'Con observaciones':'Válido'}</td><td><button className="text-button" onClick={()=>onDetail(r.ordinal)}>{r.sourceSheet} · fila {r.sourceRow}</button></td></tr>)}</tbody></table></div><Pager offset={offset} total={query.value.total} size={50} onChange={setOffset}/></>}
 </section>;
}
export function Gantt({master,state,onChange,onDenied,onDetail,view='gantt'}:{master:Master;state:BoardState;onChange:(s:BoardState)=>void;onDenied:()=>void;onDetail:(id:number)=>void;view?:'gantt'|'lots'|'indicators'}){
 const [draft,setDraft]=useState(state),[offset,setOffset]=useState(0),[selection,setSelection]=useState<Selection|null>(null);
 const query=useLoad<Result>('web4_gantt',{p_snapshot:master.snapshotHash,p_from:state.from,p_to:state.to,p_filters:state.filters,p_offset:offset},onDenied);
 const options=useLoad<Options>('web4_gantt_options',{p_snapshot:master.snapshotHash},onDenied);
 const filterKey=JSON.stringify(state);
 useEffect(()=>{setOffset(0);setSelection(null);setDraft(state)},[filterKey,master.snapshotHash]);
 function update(next:BoardState){setOffset(0);setSelection(null);setDraft(next);onChange(next)}
 function changeMode(mode:Mode){update({...state,mode,...(mode==='range'?{}:period(state.from,mode))})}
 const days=dates(state.from,state.to),now=today(),result=query.value,metrics=result?.metrics;
 const valid=dates(draft.from,draft.to).length>0;
 return <div className="stack"><section className="panel gantt-panel"><div className="panel-heading"><div><span className="eyebrow">Actividad registrada · solo lectura</span><h2>{view==='lots'?'Actividad por lote':view==='indicators'?'Indicadores del periodo':'Gantt de labores ejecutadas'}</h2><p className="muted">{dateLabel(state.from)} — {dateLabel(state.to)}</p></div><span className="pill">Sin regla de avance</span></div>
  <div className="gantt-toolbar"><div className="gantt-modes" role="group" aria-label="Escala de fechas">{([['month','Mes'],['week','Semana'],['range','Rango']] as const).map(([mode,label])=><button key={mode} className={state.mode===mode?'primary':'secondary'} aria-pressed={state.mode===mode} onClick={()=>changeMode(mode)}>{label}</button>)}</div>
   <div className="gantt-moves"><button className="secondary" aria-label="Periodo anterior" onClick={()=>update(movePeriod(state,-1))}>←</button><button className="secondary" onClick={()=>update({...state,mode:state.mode==='range'?'month':state.mode,...period(now,state.mode==='range'?'month':state.mode)})}>Hoy</button><button className="secondary" aria-label="Periodo siguiente" onClick={()=>update(movePeriod(state,1))}>→</button>
   {options.value?.latest&&<button className="text-button" onClick={()=>update({...state,mode:'month',...period(options.value!.latest!,'month')})}>Última actividad</button>}</div></div>
  <form className="filters" onSubmit={e=>{e.preventDefault();if(valid)update({...draft,mode:draft.from===state.from&&draft.to===state.to?state.mode:'range'})}}>
   <label>Desde<input type="date" value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label><label>Hasta<input type="date" value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label>
   {fields.map(([field,label])=><label key={field}>{label}<select value={draft.filters[field]??''} onChange={e=>{const filters={...draft.filters};if(e.target.value)filters[field]=e.target.value;else delete filters[field];setDraft({...draft,filters})}}><option value="">Todos</option>{options.value?.fields?.[field]?.map(value=><option key={value}>{value}</option>)}</select></label>)}
   <label>Alertas<select value={draft.filters.alerts??''} onChange={e=>{const filters={...draft.filters};if(e.target.value)filters.alerts=e.target.value;else delete filters.alerts;setDraft({...draft,filters})}}><option value="">Todas</option><option value="WITH">Con alertas</option><option value="NONE">Sin alertas</option></select></label>
   <button className="primary" disabled={!valid}>Aplicar filtros</button><button type="button" className="text-button" onClick={()=>update({...state,filters:{}})}>Limpiar filtros</button>
  </form>{!valid&&<p className="notice" role="alert">Elige un rango válido de hasta 93 días.</p>}{options.error&&<LoadMessage {...options}/>}
  <p className="gantt-legend"><span>━ Actividad registrada</span><span>▧ Con observaciones</span><span>│ Hoy (Colombia)</span></p>
  <p className="muted">Los huecos no se rellenan: ausencia de registro no demuestra ausencia de trabajo. Los colores identifican labores, no cumplimiento. La planificación y sus porcentajes requieren reglas aprobadas.</p>
  {!result?<LoadMessage {...query}/>:<><section className="metrics" aria-label="Indicadores de actividad filtrada">{[['Registros representados',metrics!.records],['Lotes con actividad',metrics!.lots],['Labores distintas',metrics!.labors],['Días con actividad',metrics!.activeDays]].map(([label,value])=><article className="metric" key={label}><span>{label}</span><strong>{value.toLocaleString('es-CO')}</strong></article>)}</section>
   <p className="muted">{metrics!.observed} registros representados tienen observaciones. Excluidos del periodo: {metrics!.excluded} bloqueados o sin lote/labor. Además, {metrics!.undated} registros sin fecha coinciden con los filtros y no pueden ubicarse en el calendario.</p>
   {view==='indicators'?<div className="notice">Los indicadores cubren todo el periodo filtrado, no solo la página de barras. No se suman cantidades con unidades diferentes ni se calcula avance sin planificación.</div>:<>
    {!result.rows.length?<p className="empty-state">No hay actividad representable para este periodo y filtros. Prueba «Última actividad» o cambia las fechas.</p>:view==='lots'?<div className="table-wrap"><table><caption>Resumen por lote y labor · página actual</caption><thead><tr><th>Lote</th><th>Labor</th><th>Registros</th><th>Días activos</th><th>Consultar días</th></tr></thead><tbody>{result.rows.map(row=><tr key={JSON.stringify([row.lot,row.labor])}><td>{row.lot}</td><td>{row.labor}</td><td>{row.records}</td><td>{row.active_days}</td><td><div className="gantt-day-links">{row.days.map(day=><button className="text-button" key={day.date} onClick={()=>setSelection({lot:row.lot,labor:row.labor,date:day.date})}>{dateLabel(day.date)}</button>)}</div></td></tr>)}</tbody></table></div>:
     <div className="gantt-scroll" tabIndex={0} role="region" aria-label="Calendario horizontal por lote y labor"><table className="gantt-table"><caption>Actividad por lote y labor. Cada segmento se puede abrir para consultar sus registros.</caption><thead><tr><th className="gantt-sticky" scope="col">Lote / labor</th>{days.map(day=><th scope="col" key={day} className={day===now?'gantt-today':''}><span>{new Intl.DateTimeFormat('es-CO',{weekday:'narrow',timeZone:'UTC'}).format(new Date(day+'T00:00:00Z'))}</span><strong>{day.slice(8)}</strong><small>{day.slice(5,7)}</small></th>)}</tr></thead><tbody>{result.rows.map((row,index)=>{const cells=new Map(row.days.map(day=>[day.date,day]));return <tr key={JSON.stringify([row.lot,row.labor])} className={index===0||result.rows[index-1].lot!==row.lot?'gantt-lot-start':''}><th scope="row" className="gantt-sticky"><strong>{row.lot}</strong><span>{row.labor}</span><small>{row.records} registros · {row.active_days} días</small></th>{days.map((day,i)=>{const cell=cells.get(day);return <td key={day} className={day===now?'gantt-today':''}>{cell&&<button className={`gantt-bar ${laborColor(row.labor)} ${cell.observed?'gantt-observed':''} ${!cells.has(days[i-1])?'bar-start':''} ${!cells.has(days[i+1])?'bar-end':''}`} title={`${row.lot} · ${row.labor} · ${dateLabel(day)} · ${cell.records} registros${cell.observed?' · Con observaciones':''}`} aria-label={`${row.lot}, ${row.labor}, ${dateLabel(day)}, ${cell.records} registros${cell.observed?', con observaciones':''}`} onClick={()=>setSelection({lot:row.lot,labor:row.labor,date:day})}>{cell.records}</button>}</td>})}</tr>})}</tbody></table></div>}
    <Pager offset={offset} total={result.totalGroups} size={25} onChange={n=>{setOffset(n);setSelection(null)}}/>
   </>}
  </>}
 </section>{selection&&<DayDetail key={JSON.stringify([selection,filterKey,master.snapshotHash])} selection={selection} master={master} state={state} onDenied={onDenied} onDetail={onDetail} onClose={()=>setSelection(null)}/>}</div>;
}
