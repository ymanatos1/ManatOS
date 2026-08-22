import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const path = resolve(process.cwd(), 'data/database.json');
const empty = {sysUsers:{},sysPrincipals:{},sysApplications:{},sysLicenses:{},sysExternalIdentities:{},sysUserPrincipals:{},sysUserInvitations:{}};
await writeFile(path, JSON.stringify(empty,null,2)+'\n','utf8');
console.log(`Reset ${path}`);
