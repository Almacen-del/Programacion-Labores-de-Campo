import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configured, supabase, rpc, errorText, type Bootstrap } from './api';
import { Workspace } from './Workspace';

function Brand(){return <div className="brand"><span className="brand-mark" aria-hidden="true">A</span><div><strong>ARLES</strong><span>Control de labores</span></div></div>}
export function App(){
  const [session,setSession]=useState<Session|null>(null);
  const [checking,setChecking]=useState(true);
  const [data,setData]=useState<Bootstrap|null>(null);
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const denied=useCallback(()=>{setData(null);setNotice('Tu sesión ya no permite consultar la aplicación. Ingresa nuevamente con una cuenta autorizada.');},[]);
  useEffect(()=>{
    if(!supabase){setChecking(false);return}
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setChecking(false);if(!next)setData(null)});
    void supabase.auth.getSession().then(({data,error})=>{setSession(data.session);setChecking(false);if(error)setNotice('No se pudo recuperar la sesión. Vuelve a ingresar.');}).catch(()=>{setChecking(false);setNotice('No se pudo recuperar la sesión. Vuelve a ingresar.');});
    if(new URLSearchParams(location.search).has('error') || location.hash.includes('error=')){
      setNotice('No se completó el inicio de sesión. Usa una de las cuentas autorizadas.');history.replaceState({},'','/');
    }
    return ()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{
    if(!session){setData(null);return}
    const controller=new AbortController();
    setNotice('');
    void rpc<Bootstrap>('web2_bootstrap',{},controller.signal).then(result=>{
      if(controller.signal.aborted)return;setData(result);
      if(location.pathname==='/auth/callback')history.replaceState({},'','/');
    }).catch(error=>{if(!controller.signal.aborted){setData(null);setNotice(errorText(error))}});
    return ()=>controller.abort();
  },[session?.user.id,attempt]);
  async function login(){
    if(!supabase)return;
    setBusy(true);setNotice('');
    const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/auth/callback',scopes:'openid email profile',queryParams:{prompt:'select_account'}}});
    if(error){setNotice('No se pudo abrir Google. Inténtalo nuevamente.');setBusy(false)}
  }
  async function logout(){
    setData(null);setSession(null);setNotice('');
    const {error}=await supabase!.auth.signOut({scope:'local'});
    if(error)setNotice('No se pudo cerrar la sesión. Cierra esta pestaña para eliminar la sesión local.');
  }
  if(data)return <><a className="skip-link" href="#main">Saltar al contenido</a><Workspace initial={data} brand={<Brand/>} onLogout={()=>void logout()} onDenied={denied}/></>;
  return <main className="login"><section className="login-story"><Brand/><div><span className="eyebrow">Programación de labores de campo</span><h1>Más claridad.<br/>Menos trabajo<br/><em>repetido.</em></h1><p>Tu espacio para consultar el maestro, revisar los registros y mantener la información del campo organizada.</p></div><span className="story-footer">ARLES · CONTROL DE LABORES</span></section><section className="login-access"><div className="login-card"><span className="eyebrow">Espacio privado</span><h2>Bienvenido a tu<br/>control de labores.</h2><p>Ingresa con tu cuenta de Google autorizada para continuar.</p>{notice&&<div className="notice error" role="alert">{notice}</div>}{!configured&&<div className="notice" role="status">La conexión de acceso privado está en preparación. Todavía no se pueden consultar datos desde esta pantalla.</div>}{session?<><p className="muted">{notice?'Acceso pendiente de validar.':'Comprobando los permisos de tu cuenta…'}</p>{notice&&<button className="secondary" onClick={()=>setAttempt(v=>v+1)}>Reintentar acceso</button>} <button className="secondary" onClick={()=>void logout()}>Usar otra cuenta</button></>:<button className="primary" disabled={!configured||checking||busy} onClick={()=>void login()}>{checking?'Comprobando sesión…':busy?'Abriendo Google…':'Continuar con Google'}<span aria-hidden="true">↗</span></button>}<div className="login-note"><span aria-hidden="true">◇</span><p>Acceso exclusivo para las cuentas aprobadas.<br/>El maestro de Drive permanece privado.</p></div></div><span className="access-footer">Conexión segura · Sin registro público</span></section></main>;
}
