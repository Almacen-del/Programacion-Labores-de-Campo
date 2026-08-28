import {useEffect,useState} from 'react';
import {ApiError,errorText,rpc,supabase,type Master} from './api';
type Info={connection:{account:string;connectedAt:string|null;canReconnect:boolean};running:boolean;
 changes:{snapshotHash:string;counts:{added:number;removed:number;unchanged:number;possibleCorrections:number}|null}|null};
export function SyncHealth({master,onDenied}:{master:Master;onDenied:()=>void}){
 const [info,setInfo]=useState<Info|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const abort=new AbortController();
  void rpc<Info>('web3_sync_info',{},abort.signal).then(value=>{if(!abort.signal.aborted){setInfo(value);setError('')}}).catch(e=>{
   if(abort.signal.aborted)return;if(e instanceof ApiError&&e.code==='ACCESS_DENIED')onDenied();else setError(errorText(e));
  });return()=>abort.abort();
 },[master.snapshotHash,master.lastCheckedAt,onDenied]);
 async function reconnect(){
  if(!supabase||busy)return;
  if(!window.confirm('Se abrirá Google para renovar el acceso con almacen@arlessas.com. La conexión actual se conserva hasta validar la nueva. ¿Continuar?'))return;
  setBusy(true);setError('');
  try{
   const {data,error:sessionError}=await supabase.auth.getSession();
   if(sessionError||!data.session){onDenied();return}
   const response=await fetch('https://dziwhbjyvxdbplthpazt.supabase.co/functions/v1/drive-oauth/reconnect',{
    method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`},signal:AbortSignal.timeout(20000)});
   if(response.status===401||response.status===403){onDenied();return}
   if(response.status===409){setError('Ya se inició una conexión. Espera un minuto antes de intentar otra.');return}
   if(!response.ok)throw new Error('reconnect_failed');
   const result=await response.json();const target=new URL(result.launchUrl);
   if(target.origin!=='https://dziwhbjyvxdbplthpazt.supabase.co'||target.pathname!=='/functions/v1/drive-oauth/launch'||! /^[a-f0-9]{64}$/.test(target.searchParams.get('ticket')??''))throw new Error('invalid_url');
   window.location.assign(target.href);
  }catch{setError('No se pudo iniciar la reconexión. La conexión guardada no se ha sustituido.')}
  finally{setBusy(false)}
 }
 const counts=info?.changes?.snapshotHash===master.snapshotHash?info.changes.counts:null;
 const rows:[string,number][]=counts?[['Contenidos nuevos',counts.added],['Contenidos que dejaron de aparecer',counts.removed],['Sin cambios de contenido',counts.unchanged],['Posibles correcciones en la misma fila',counts.possibleCorrections]]:[];
 return <section className="panel"><span className="eyebrow">Continuidad y cambios</span><h2>Estado de la conexión</h2>
  {error&&<p className="notice error" role="alert">{error}</p>}{!info&&!error&&<p role="status">Consultando conexión…</p>}
  {info&&<><p>{info.running?'Hay una revisión en curso; la versión anterior sigue disponible.':info.connection.connectedAt?'Hay una autorización guardada. La última revisión indica si pudo utilizarse.':'No hay autorización de Drive guardada.'}</p>
   <p className="muted">Cuenta de Drive: {info.connection.account}. Iniciar sesión en la web no renueva este permiso.</p>
   {info.connection.canReconnect?<button className="secondary" disabled={busy} onClick={()=>void reconnect()}>{busy?'Preparando…':'Reconectar Drive'}</button>:<p className="notice">El relevo de Drive al ingeniero requiere una entrega controlada con la cuenta temporal.</p>}
   <h3 className="section-heading">Comparación de la última versión</h3>
   {counts?<><dl className="facts">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value.toLocaleString('es-CO')}</dd></div>)}</dl><p className="muted">Las posibles correcciones están incluidas en entradas y salidas: no sumes esas cifras. Sin ID estable, una corrección no se distingue con certeza de una sustitución. Mover filas idénticas no crea altas ni bajas. Se conservan versiones anteriores.</p></>:<p className="muted">Disponible cuando llegue una nueva versión después de activar WEB 3.</p>}</>}
 </section>;
}
