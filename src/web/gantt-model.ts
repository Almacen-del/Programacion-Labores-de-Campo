export type Mode='month'|'week'|'range';
export type Filters=Record<string,string>;
export type BoardState={mode:Mode;from:string;to:string;filters:Filters};
const DAY=86400000;
export function iso(date:Date){return date.toISOString().slice(0,10)}
export function today(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>parts.find(p=>p.type===k)?.value).join('-')}
export function parseDate(value:string){const date=new Date(value+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(date.getTime())&&iso(date)===value?date:null}
export function dates(from:string,to:string){const a=parseDate(from),b=parseDate(to);if(!a||!b)return [];const length=Math.round((+b-+a)/DAY)+1;return length>0&&length<=93?Array.from({length},(_,i)=>iso(new Date(+a+i*DAY))):[]}
export function period(anchor:string,mode:Mode):{from:string;to:string}{const d=parseDate(anchor);if(!d)throw new Error('INVALID_DATE');if(mode==='week'){const start=+d-((d.getUTCDay()+6)%7)*DAY;return {from:iso(new Date(start)),to:iso(new Date(start+6*DAY))}}return {from:iso(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1))),to:iso(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)))}}
export function initialBoard():BoardState{return {mode:'month',...period(today(),'month'),filters:{}}}
export function movePeriod(state:BoardState,direction:number){const d=parseDate(state.from);if(!d)return state;if(state.mode==='month')return {...state,...period(iso(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+direction,1))),'month')};const length=dates(state.from,state.to).length||7;return {...state,from:iso(new Date(+d+direction*length*DAY)),to:iso(new Date(+parseDate(state.to)!+direction*length*DAY))}}
export function laborColor(labor:string){let hash=0;for(const char of labor)hash=(hash*31+char.charCodeAt(0))|0;return `labor-${(hash>>>0)%6}`}
export function dateLabel(value:string){return new Intl.DateTimeFormat('es-CO',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(parseDate(value)!)}
