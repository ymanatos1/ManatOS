import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {StorageAppError} from '@manatos/shared';
import {emptyDatabaseState,type DatabaseState,type PersistedDatabaseState} from './types.js';
/** JSON persistence used only by the in-memory storage adapter. */
export class JsonFilePersistence {
 private readonly filePath:string;
 constructor(filePath:string){this.filePath=resolve(process.cwd(),filePath);}
 async load():Promise<DatabaseState>{try{const raw=JSON.parse(await readFile(this.filePath,'utf8')) as PersistedDatabaseState;return{sysUsers:new Map(Object.entries(raw.sysUsers??{})),sysPrincipals:new Map(Object.entries(raw.sysPrincipals??{})),sysApplications:new Map(Object.entries(raw.sysApplications??{})),sysLicenses:new Map(Object.entries(raw.sysLicenses??{})),sysExternalIdentities:new Map(Object.entries(raw.sysExternalIdentities??{})),sysUserPrincipals:new Map(Object.entries(raw.sysUserPrincipals??{})),sysUserInvitations:new Map(Object.entries(raw.sysUserInvitations??{}))};}catch(e){if(isNodeError(e)&&e.code==='ENOENT')return emptyDatabaseState();throw new StorageAppError(`Failed to load '${this.filePath}'.`,e);}}
 async save(s:DatabaseState){const p:PersistedDatabaseState={sysUsers:Object.fromEntries(s.sysUsers),sysPrincipals:Object.fromEntries(s.sysPrincipals),sysApplications:Object.fromEntries(s.sysApplications),sysLicenses:Object.fromEntries(s.sysLicenses),sysExternalIdentities:Object.fromEntries(s.sysExternalIdentities),sysUserPrincipals:Object.fromEntries(s.sysUserPrincipals),sysUserInvitations:Object.fromEntries(s.sysUserInvitations)};const tmp=`${this.filePath}.tmp`;try{await mkdir(dirname(this.filePath),{recursive:true});await writeFile(tmp,JSON.stringify(p,null,2)+'\n','utf8');await rename(tmp,this.filePath);}catch(e){throw new StorageAppError(`Failed to persist '${this.filePath}'.`,e);}}
}
function isNodeError(e:unknown):e is NodeJS.ErrnoException{return e instanceof Error&&'code' in e;}
