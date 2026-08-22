import {randomUUID} from 'node:crypto';
import {ConflictError,NotFoundError,type SysBOEntity,type SysBOMetadata} from '@manatos/shared';
export interface ListQuery{page:number;pageSize:number;sort?:string;direction:'asc'|'desc';filters:Record<string,string>}
export interface ListResult<T>{items:T[];total:number;page:number;pageSize:number;totalPages:number}
/** Generic GUID-keyed Map repository. Unique fields are read from hard-coded BO metadata. */
export class InMemoryRepository<T extends SysBOEntity>{
 constructor(private readonly records:Map<string,T>,private readonly metadata:SysBOMetadata<T>){}
 async list(q:ListQuery):Promise<ListResult<T>>{let items=[...this.records.values()];for(const [field,value] of Object.entries(q.filters)){if(!value)continue;const needle=norm(value);items=items.filter(i=>norm(String((i as unknown as Record<string,unknown>)[field]??'')).includes(needle));}if(q.sort&&this.metadata.fieldDefinition[q.sort]){const f=q.sort;items.sort((a,b)=>{const l=(a as unknown as Record<string,unknown>)[f],r=(b as unknown as Record<string,unknown>)[f];const c=String(l??'').localeCompare(String(r??''),undefined,{numeric:true,sensitivity:'base'});return q.direction==='asc'?c:-c;});}const total=items.length,totalPages=Math.max(1,Math.ceil(total/q.pageSize)),page=Math.min(Math.max(1,q.page),totalPages),start=(page-1)*q.pageSize;return{items:items.slice(start,start+q.pageSize),total,page,pageSize:q.pageSize,totalPages};}
 async getById(id:string){return this.records.get(id)??null;}
 async findByUnique(field:string,value:unknown):Promise<T|null>{const target=norm(String(value??''));for(const r of this.records.values()){if(norm(String((r as unknown as Record<string,unknown>)[field]??''))===target)return r;}return null;}
 async create(input:Omit<T,'id'|'createdAt'|'updatedAt'>):Promise<T>{await this.ensureUnique(input);const now=new Date().toISOString();const r={...input,id:randomUUID(),createdAt:now,updatedAt:now} as T;this.records.set(r.id,r);return r;}
 async update(id:string,changes:Partial<T>):Promise<T>{const old=this.records.get(id);if(!old)throw new NotFoundError(this.metadata.name,id);const candidate={...old,...changes,id,updatedAt:new Date().toISOString()} as T;await this.ensureUnique(candidate,id);this.records.set(id,candidate);return candidate;}
 async delete(id:string){if(!this.records.delete(id))throw new NotFoundError(this.metadata.name,id);}
 values(){return [...this.records.values()];}
 private async ensureUnique(candidate:Partial<T>,excludeId?:string){for(const f of Object.values(this.metadata.fieldDefinition)){if(!f.unique||f.generated)continue;const v=(candidate as Record<string,unknown>)[f.key];if(v===undefined||v===null||v==='')continue;const d=await this.findByUnique(f.key,v);if(d&&d.id!==excludeId)throw new ConflictError('DUPLICATE_BO_VALUE',`${this.metadata.name}.${f.key} '${String(v)}' already exists.`,`${f.label} '${String(v)}' is already in use. Please enter another value.`);}}
}
const norm=(v:string)=>v.trim().toLocaleLowerCase();
