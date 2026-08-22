import { SysLicenseStatus, SysPrincipalType, SysUserRole, type SysApplication, type SysLicense, type SysPrincipal, type SysUser } from './domain.js';
export type SysBOFieldType='guid'|'string'|'email'|'boolean'|'number'|'date'|'enum'|'reference';
export interface SysBOFieldMetadata {
  key:string; label:string; type:SysBOFieldType; order:number; required?:boolean; nullable?:boolean;
  generated?:boolean; readOnly?:boolean; unique?:boolean; sensitive?:boolean; minLength?:number;
  maxLength?:number; enumValues?:readonly string[]; referenceBOKey?:string;
}
/** UI-neutral, hard-coded BO definition used by API, storage and any future client. */
export interface SysBOMetadata<T> { key:string; name:string; pluralName:string; primaryField:keyof T & string; fieldDefinition:Record<string,SysBOFieldMetadata>; }
const common:Record<string,SysBOFieldMetadata>={
 id:{key:'id',label:'Id',type:'guid',order:0,required:true,generated:true,readOnly:true,unique:true},
 name:{key:'name',label:'Name',type:'string',order:10,required:true,unique:true,minLength:2,maxLength:120},
 enabled:{key:'enabled',label:'Enabled',type:'boolean',order:900,required:true},
 createdAt:{key:'createdAt',label:'Created',type:'date',order:910,generated:true,readOnly:true},
 updatedAt:{key:'updatedAt',label:'Updated',type:'date',order:920,generated:true,readOnly:true}
};
export const sysUsersMetadata:SysBOMetadata<SysUser>={key:'sys-users',name:'SysUser',pluralName:'SysUsers',primaryField:'name',fieldDefinition:{...common,name:{...common.name,label:'User name'},
 email:{key:'email',label:'Email',type:'email',order:20,required:true,unique:true,maxLength:254},
 emailVerified:{key:'emailVerified',label:'Email verified',type:'boolean',order:30,required:true},
 passwordHash:{key:'passwordHash',label:'Password hash',type:'string',order:40,nullable:true,sensitive:true,readOnly:true},
 passwordChangedAt:{key:'passwordChangedAt',label:'Password changed',type:'date',order:50,nullable:true,readOnly:true},
 role:{key:'role',label:'Role',type:'enum',order:60,required:true,enumValues:Object.values(SysUserRole)},
 firstName:{key:'firstName',label:'First name',type:'string',order:70,maxLength:100},
 lastName:{key:'lastName',label:'Last name',type:'string',order:80,maxLength:100},
 description:{key:'description',label:'Description',type:'string',order:90,maxLength:2000}
}};
export const sysPrincipalsMetadata:SysBOMetadata<SysPrincipal>={key:'sys-principals',name:'SysPrincipal',pluralName:'SysPrincipals',primaryField:'name',fieldDefinition:{...common,
 principalType:{key:'principalType',label:'Principal type',type:'enum',order:20,required:true,enumValues:Object.values(SysPrincipalType)},
 parentId:{key:'parentId',label:'Parent principal',type:'reference',order:30,nullable:true,referenceBOKey:'sys-principals'},
 description:{key:'description',label:'Description',type:'string',order:40,maxLength:2000}
}};
export const sysApplicationsMetadata:SysBOMetadata<SysApplication>={key:'sys-applications',name:'SysApplication',pluralName:'SysApplications',primaryField:'name',fieldDefinition:{...common,
 appName:{key:'appName',label:'App name',type:'string',order:20,required:true,unique:true,minLength:2,maxLength:120},
 fullName:{key:'fullName',label:'Full name',type:'string',order:30,required:true,maxLength:250},
 version:{key:'version',label:'Version',type:'string',order:40,maxLength:50},
 description:{key:'description',label:'Description',type:'string',order:50,maxLength:2000}
}};
export const sysLicensesMetadata:SysBOMetadata<SysLicense>={key:'sys-licenses',name:'SysLicense',pluralName:'SysLicenses',primaryField:'name',fieldDefinition:{...common,
 principalId:{key:'principalId',label:'Customer',type:'reference',order:20,required:true,referenceBOKey:'sys-principals'},
 applicationId:{key:'applicationId',label:'Application',type:'reference',order:30,required:true,referenceBOKey:'sys-applications'},
 licenseKey:{key:'licenseKey',label:'License key',type:'string',order:40,maxLength:250},
 status:{key:'status',label:'Status',type:'enum',order:50,required:true,enumValues:Object.values(SysLicenseStatus)},
 validFrom:{key:'validFrom',label:'Valid from',type:'date',order:60}, validUntil:{key:'validUntil',label:'Valid until',type:'date',order:70,nullable:true},
 quantity:{key:'quantity',label:'Quantity',type:'number',order:80,required:true}, description:{key:'description',label:'Description',type:'string',order:90,maxLength:2000}
}};
export const allSysBOMetadata={ [sysUsersMetadata.key]:sysUsersMetadata,[sysPrincipalsMetadata.key]:sysPrincipalsMetadata,[sysApplicationsMetadata.key]:sysApplicationsMetadata,[sysLicensesMetadata.key]:sysLicensesMetadata } as const;
