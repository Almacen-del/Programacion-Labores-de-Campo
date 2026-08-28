import { createClient } from '@supabase/supabase-js';
import type { ParsedLaborRecord, ParsedSheet, ParsedAlert } from '../importer/types';
const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
// Fail closed: un build mal configurado no apunta a otro proyecto.
export const configured=url==='https://dziwhbjyvxdbplthpazt.supabase.co' && typeof key==='string' && key.startsWith('sb_publishable_');
export const supabase=configured?createClient(url,key,{
  auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.sessionStorage},
  global:{headers:{'X-Client-Info':'arles-web2'}}
}):null;
export interface Master {
  snapshotHash:string|null; fileName:string; importedAt:string|null; sourceModifiedAt:string|null;
  sourceVersion:string|null; lastCheckedAt:string|null; lastSuccessAt:string|null; lastError:string|null;
  intervalMinutes:number; summary:{total:number;valid:number;observed:number;blocked:number;alerts:number}|null;
  sheets:ParsedSheet[];
}
export interface Bootstrap {member:{email:string;role:'TEST_ADMIN'|'ENGINEER'};master:Master}
export type RecordRow=Omit<ParsedLaborRecord,'rawValues'>&{ordinal:number;rawValues?:unknown[]};
export type AlertRow=ParsedAlert&{ordinal:number;recordOrdinal:number;lot:string|null;labor:string|null;sourceSheet:string;sourceRow:number};
export interface Page<T>{rows:T[];total:number}
export interface HistoryData {
  versions:{snapshot_hash:string;created_at:string;summary:NonNullable<Master['summary']>}[];
  runs:{id:string;started_at:string;finished_at:string|null;status:string;error_code:string|null}[];
}
export class ApiError extends Error {constructor(public code:string){super(code)}}
export async function rpc<T>(name:string,args:Record<string,unknown>={},signal?:AbortSignal):Promise<T>{
  if(!supabase)throw new ApiError('NOT_CONFIGURED');
  let query=supabase.rpc(name,args);
  if(signal)query=query.abortSignal(signal);
  const {data,error,status}=await query;
  if(error){
    if(error.message==='SNAPSHOT_CHANGED')throw new ApiError('SNAPSHOT_CHANGED');
    if(status===401 || status===403 || error.code==='42501')throw new ApiError('ACCESS_DENIED');
    throw new ApiError(error.code==='22023'?'INVALID_FILTER':'UNAVAILABLE');
  }
  return data as T;
}
export function errorText(error:unknown):string{
  const code=error instanceof ApiError?error.code:'';
  if(code==='ACCESS_DENIED')return 'La cuenta no tiene acceso o su sesión venció. Vuelve a iniciar sesión con una cuenta autorizada.';
  if(code==='SNAPSHOT_CHANGED')return 'Llegó una nueva versión del maestro. Actualiza la consulta para continuar.';
  if(code==='INVALID_FILTER')return 'Revisa el rango de fechas y los filtros de la consulta.';
  return 'No se pudo consultar el servidor. Comprueba tu conexión e inténtalo nuevamente.';
}
