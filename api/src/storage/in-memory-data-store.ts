import {sysApplicationsMetadata,sysLicensesMetadata,sysPrincipalsMetadata,sysUsersMetadata,type SysApplication,type SysExternalIdentity,type SysLicense,type SysPrincipal,type SysUser,type SysUserPrincipal,type SysUserInvitation} from '@manatos/shared';
import {InMemoryRepository} from './in-memory-repository.js';import {JsonFilePersistence} from './json-file-persistence.js';import type {DatabaseState} from './types.js';
/** Replaceable data-store adapter; business services never know JSON details. */
export class InMemoryDataStore{
 private state!:DatabaseState;public sysUsers!:InMemoryRepository<SysUser>;public sysPrincipals!:InMemoryRepository<SysPrincipal>;public sysApplications!:InMemoryRepository<SysApplication>;public sysLicenses!:InMemoryRepository<SysLicense>;
 constructor(private readonly persistence:JsonFilePersistence){}
 async initialize(){this.state=await this.persistence.load();this.rebuild();}
 externalIdentities():Map<string,SysExternalIdentity>{return this.state.sysExternalIdentities;} userPrincipals():Map<string,SysUserPrincipal>{return this.state.sysUserPrincipals;} userInvitations():Map<string,SysUserInvitation>{return this.state.sysUserInvitations;}
 /** Snapshot/rollback emulates transaction semantics for the demo store. */
 async executeTransaction<T>(fn:()=>Promise<T>):Promise<T>{const snap=structuredClone(this.state);try{const r=await fn();await this.persistence.save(this.state);return r;}catch(e){this.state=snap;this.rebuild();throw e;}}
 async save(){await this.persistence.save(this.state);}
 private rebuild(){this.sysUsers=new InMemoryRepository(this.state.sysUsers,sysUsersMetadata);this.sysPrincipals=new InMemoryRepository(this.state.sysPrincipals,sysPrincipalsMetadata);this.sysApplications=new InMemoryRepository(this.state.sysApplications,sysApplicationsMetadata);this.sysLicenses=new InMemoryRepository(this.state.sysLicenses,sysLicensesMetadata);}
}
