import {operationContext,type SysBOEntity,type SysBOMetadata} from '@manatos/shared';import type {InMemoryDataStore} from '../storage/in-memory-data-store.js';import type {InMemoryRepository,ListQuery,ListResult} from '../storage/in-memory-repository.js';
export class GenericSysBOService<T extends SysBOEntity>{constructor(protected store:InMemoryDataStore,protected repository:InMemoryRepository<T>,public readonly metadata:SysBOMetadata<T>){}
 async list(q:ListQuery):Promise<ListResult<T>>{return this.repository.list(q);} async get(id:string){return this.repository.getById(id);}
 async create(input:Omit<T,'id'|'createdAt'|'updatedAt'>):Promise<T>{return this.store.executeTransaction(()=>operationContext.run(`Create ${this.metadata.name} in data store`,async s=>{s.comment('name',input.name);return this.repository.create(input);}));}
 async update(id:string,changes:Partial<T>):Promise<T>{return this.store.executeTransaction(()=>operationContext.run(`Update ${this.metadata.name} in data store`,async s=>{s.addContext({id,name:changes.name});return this.repository.update(id,changes);}));}
 async delete(id:string){await this.store.executeTransaction(()=>operationContext.run(`Delete ${this.metadata.name} from data store`,async s=>{s.comment('id',id);await this.repository.delete(id);}));}
}
