import argon2 from 'argon2';
import {AuthenticationError,SysUserRole,ValidationAppError,operationContext,sysUsersMetadata,validatePassword,type SysUser} from '@manatos/shared';
import type {InMemoryDataStore} from '../storage/in-memory-data-store.js';import {GenericSysBOService} from './generic-sysbo-service.js';
export interface CreateSysUserInput{name:string;email:string;password?:string;role?:SysUserRole;firstName?:string;lastName?:string;description?:string;emailVerified?:boolean;enabled?:boolean}
export class SysUserService extends GenericSysBOService<SysUser>{constructor(store:InMemoryDataStore){super(store,store.sysUsers,sysUsersMetadata);}
 async createUser(i:CreateSysUserInput):Promise<SysUser>{return operationContext.run('Prepare SysUser account',async s=>{s.addContext({name:i.name,email:i.email,password:i.password});const passwordHash=i.password?await this.hashPassword(i.password):null;return this.create({name:i.name.trim(),email:i.email.trim().toLowerCase(),emailVerified:i.emailVerified??false,passwordHash,passwordChangedAt:passwordHash?new Date().toISOString():null,role:i.role??SysUserRole.Guest,...(i.firstName?{firstName:i.firstName}:{}),...(i.lastName?{lastName:i.lastName}:{}),...(i.description?{description:i.description}:{}),enabled:i.enabled??true});});}
 async lookupByIdentity(identity:string){return (await this.repository.findByUnique('name',identity))??this.repository.findByUnique('email',identity.trim().toLowerCase());}
 async verifyLocalCredentials(identity:string,password:string){return operationContext.run('Verify local SysUser credentials',async s=>{s.addContext({identity,password});const u=await this.lookupByIdentity(identity);if(!u||!u.enabled||!u.passwordHash)throw new AuthenticationError();if(!await argon2.verify(u.passwordHash,password))throw new AuthenticationError();return u;});}
 async setPassword(id:string,p:string){const hash=await this.hashPassword(p);return this.update(id,{passwordHash:hash,passwordChangedAt:new Date().toISOString()});}
 async setEmailVerified(id:string){return this.update(id,{emailVerified:true});}
 async bootstrapAdmin(name?:string,email?:string,password?:string){if(this.repository.values().length||!name||!email||!password)return;await this.createUser({name,email,password,emailVerified:true,role:SysUserRole.Admin,description:'Bootstrap administrator created from environment configuration.'});}
 private async hashPassword(p:string){const failures=validatePassword(p);if(failures.length)throw new ValidationAppError(failures.join(' '));return argon2.hash(p,{type:argon2.argon2id});}
}
