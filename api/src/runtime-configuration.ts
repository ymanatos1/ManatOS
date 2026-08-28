/** In-process cache of non-secret SysConfiguration values used on hot paths. */
const values = new Map<string,string>();
export function setRuntimeConfiguration(name:string, value:string|undefined) { if(value===undefined) values.delete(name); else values.set(name,value); }
export function runtimeString(name:string, fallback:string):string { return values.get(name) ?? fallback; }
export function runtimeNumber(name:string, fallback:number):number { const n=Number(values.get(name)); return Number.isFinite(n)&&n>0?n:fallback; }
export function runtimeBoolean(name:string, fallback:boolean):boolean { const v=values.get(name); return v===undefined?fallback:v==='true'; }
