/** Source identity shared by local verification and candidate packaging.
 * Excludes private .env values and generated build outputs. No Git checkout required.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, lstatSync, openSync, readSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
const SOURCES=['package.json','package-lock.json','.nvmrc','.editorconfig','eslint.config.mjs',
  'shared','shared.UI','shared.UI.NG','shared.UI.EJS','api','ui.NG1','ui.EJS1','devops','scripts'];
const OMIT_DIRS=new Set(['node_modules','.git','.angular','.cache','coverage','dist','dist-host','build','.next','.turbo','tmp','temp','logs','.vs','.vscode']);
const OMIT_FILE=/^(?:\.env(?:\..*)?|.*\.(?:log|pem|p12|pfx|key)|id_ed25519|id_rsa|.*\.tsbuildinfo)$/i;
function visit(root) {
  const result=[];
  function walk(path,relative) {
    const info=lstatSync(path);
    if(info.isSymbolicLink())throw new Error(`Source includes a symlink: ${relative}`);
    if(info.isDirectory()) {
      for(const e of readdirSync(path).sort()) {
        if(OMIT_DIRS.has(e))continue;
        walk(join(path,e),`${relative}/${e}`);
      }
    } else if(info.isFile() && !OMIT_FILE.test(relative.split('/').at(-1))) result.push({path,relative});
    else if(!info.isFile())throw new Error(`Unsupported source file: ${relative}`);
  }
  for(const base of SOURCES)if(existsSync(join(root,base)))walk(join(root,base),base);
  return result.sort((a,b)=>a.relative<b.relative?-1:a.relative>b.relative?1:0);
}
export function snapshotSource(sourceRoot) {
  const root=resolve(sourceRoot), files=visit(root);
  if(files.length<8)throw new Error('Incomplete application source; source snapshot refused');
  const hash=createHash('sha256'),buf=Buffer.alloc(64*1024);
  for(const f of files) {
    hash.update(f.relative,'utf8');hash.update('\0');
    const inner=createHash('sha256'),fd=openSync(f.path,'r');
    try {let n;while((n=readSync(fd,buf,0,buf.length,null))>0)inner.update(buf.subarray(0,n));}finally{closeSync(fd);}
    hash.update(inner.digest('hex'),'ascii');hash.update('\0');
  }
  const fingerprint=hash.digest('hex');
  let commit=null,dirty=true;
  try {
    const out=execFileSync('git',['-C',root,'rev-parse','--verify','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:10000}).trim();
    if(/^[a-f0-9]{40}$/.test(out)) {
      commit=out;
      const status=execFileSync('git',['-C',root,'status','--porcelain=v1','--untracked-files=normal'],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:10000});
      dirty=Boolean(status.trim());
    }
  } catch { /* extracted ZIPs have no Git metadata */ }
  return {fingerprint,files:files.length,gitCommit:commit,identityKind:commit?'git-commit-plus-snapshot':'source-snapshot-only',dirty,sourceSha:commit||fingerprint.slice(0,40)};
}
