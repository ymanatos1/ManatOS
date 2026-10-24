#!/usr/bin/env node
/** Local ManatOS DevOps command-line adapter. Works directly in Windows CMD.
 * Calls the same DevOps scripts used by GitHub Actions. No PowerShell, no live CD.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync,
  rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotSource } from '../core/source-snapshot.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const policy=JSON.parse(readFileSync(join(root,'devops/config/env-policy.json'),'utf8'));
const workspace=resolve(root,'..','manatos-devops-local');
const reports=join(workspace,'ci-reports');
const releases=join(workspace,'release-candidates');
const scripts=join(root,'devops/scripts');
const ciOperations=['verify','quality','lint','build','test'];
const scopes=['all','api','uis','ng1','ejs1'];
function error(s){throw new Error(s);}
function options(argv,allowed=[]) {
  const o={};
  for(let i=0;i<argv.length;i++) {
    const a=argv[i];
    if(!allowed.includes(a)||Object.hasOwn(o,a))error(`Unsupported or duplicate option: ${a}`);
    if(['--plan','--preflight','--allow-readonly'].includes(a)){o[a]=true;continue;}
    if(!argv[i+1]||argv[i+1].startsWith('--'))error(`Missing value after ${a}`);
    o[a]=argv[++i];
  }
  return o;
}
function check(value,allowed,label){if(!allowed.includes(value))error(`Unsupported ${label}: ${value}`);return value;}
async function execute(script,args=[],settings={}) {
  const file=join(scripts,script);
  if(!existsSync(file))error(`Missing DevOps engine script: ${script}`);
  const started=Date.now();
  console.log(`\n>> ${script} ${args.filter(x=>!x.startsWith('--sha')).join(' ')}`);
  const exit=await new Promise((done,reject)=>{
    const child=spawn(process.execPath,[file,...args],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,...settings}});
    child.on('error',reject);
    child.on('close',(code,signal)=>done(code===null?1:code));
  });
  console.log(`<< ${script}: ${exit===0?'PASS':'FAIL'} (${((Date.now()-started)/1000).toFixed(1)}s)`);
  if(exit!==0)error(`${script} exited ${exit}`);
}
function id(){return new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(3).toString('hex');}
function privateRedactions(selected) {
  const apps=policy.applications.filter(x=>policy.ciScopeApplications[selected].includes(x.id));
  const values=new Set();
  for(const app of apps){
    const path=join(root,app.file);
    if(!existsSync(path))continue;
    if(!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink())error(`Invalid local .env file: ${app.file}`);
    const input=readFileSync(path,'utf8');
    for(const line of input.split(/\r?\n/)){
      const match=line.match(/^\s*(?:export\s+)?([a-z_][a-z0-9_]*)\s*=\s*(.*)$/i);
      if(!match)continue;
      const name=match[1];
      if(!/(?:SECRET|KEY|TOKEN|PASSWORD|CREDENTIAL|AUTH|ENCRYPTION)/i.test(name))continue;
      let value=match[2].trim();
      if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
      if(value.length>=6 && value.length<=8192)values.add(value);
    }
  }
  return [...values];
}
function recentResults(){
  if(!existsSync(reports))return [];
  return readdirSync(reports,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>{
    const file=join(reports,x.name,'result.json');
    try{return {id:x.name,file,...JSON.parse(readFileSync(file,'utf8'))};}catch{return null;}
  }).filter(Boolean).sort((a,b)=>b.id.localeCompare(a.id));
}
function help(){
  console.log(`ManatOS.DevOps local CLI — Windows CMD / Node.js (NO PowerShell)\n\n`+
    `  node devops\\local\\cli.mjs self-test\n`+
    `  node devops\\local\\cli.mjs status\n`+
    `  node devops\\local\\cli.mjs ci --scope all --operation verify\n`+
    `  node devops\\local\\cli.mjs ci --scope all --operation verify --plan\n`+
    `  node devops\\local\\cli.mjs ci --scope all --preflight\n`+
    `  node devops\\local\\cli.mjs package [--run RUN_ID]\n`+
    `  node devops\\local\\cli.mjs package --verify ARCHIVE_PATH\n`+
    `  node devops\\local\\cli.mjs cd --plan|--simulate|--self-test\n`+
    `  node devops\\local\\cli.mjs ssh --inspect --allow-readonly\n\n`+
    `  No EJS0, no Prettier. No production deployment commands exist.\n`+
    `  Reports and NON-DEPLOYABLE candidates: ${workspace}\n`);
}
async function ci(argv) {
  const opt=options(argv,['--scope','--operation','--plan','--preflight']);
  const scope=check(opt['--scope']||'all',scopes,'scope');
  const operation=check(opt['--operation']||'verify',ciOperations,'operation');
  if(opt['--plan']) {await execute('devops-ci.mjs',['--scope',scope,'--operation',operation,'--plan']);return;}
  if(opt['--preflight']){await execute('devops-ci.mjs',['--scope',scope,'--preflight','--root',root]);return;}
  await execute('devops-ci.mjs',['--scope',scope,'--preflight','--root',root]);
  const source=snapshotSource(root);
  const run=id(), dir=join(reports,run);
  mkdirSync(dir,{recursive:true});
  const temp=mkdtempSync(join(tmpdir(),'manatos-local-redaction-'));
  const secrets=join(temp,'redactions.json');
  writeFileSync(secrets,JSON.stringify(privateRedactions(scope)),{flag:'wx',mode:0o600});
  try {
    await execute('devops-ci.mjs',['--scope',scope,'--operation',operation],{
      MANATOS_CI_REPORT_DIR:dir,MANATOS_CI_REDACTIONS_FILE:secrets,
      MANATOS_SOURCE_SHA:source.sourceSha,
      MANATOS_LOCAL_SOURCE_FINGERPRINT:source.fingerprint,
      MANATOS_LOCAL_SOURCE_DIRTY:String(source.dirty),
      MANATOS_LOCAL_SOURCE_IDENTITY_KIND:source.identityKind,
    });
  } finally {
    rmSync(temp,{recursive:true,force:true});
    console.log(`CI reports: ${dir}`);
    console.log(`Source: ${source.identityKind}; dirty=${source.dirty}; ${source.files} fingerprinted files`);
  }
}
async function candidate(argv) {
  const opt=options(argv,['--run','--verify']);
  if(opt['--verify']) {
    if(opt['--run'])error('--run cannot be combined with --verify');
    await execute('release-package.mjs',['--verify','--archive',resolve(opt['--verify'])]);return;
  }
  const list=recentResults();
  const item=opt['--run']?list.find(r=>r.id===opt['--run']):list.find(r=>r.status==='PASSED'&&r.scope==='all'&&r.operation==='verify');
  if(!item)error('No matching completed full CI run. Run local ci --scope all --operation verify first.');
  if(item.status!=='PASSED'||item.scope!=='all'||item.operation!=='verify')error('Packaging requires successful all/verify evidence');
  if(!item.sourceFingerprint)error('This CI report has no local source fingerprint; rerun local CI');
  const current=snapshotSource(root);
  if(current.fingerprint!==item.sourceFingerprint)error('Source has changed since CI; rerun full verification before packaging');
  if(current.sourceSha!==item.sha)error('Source identity changed since CI');
  const out=join(releases,item.id);
  await execute('release-package.mjs',['--package','--source-root',root,
    '--output-dir',out,'--sha',item.sha,'--ci-report',item.file]);
  console.log(`Compiled candidates only: ${out}\nNOT DEPLOYABLE — runtime dependencies and Passenger validation are outstanding.`);
}
async function selfTest() {
  const tests=[['devops-ci.mjs',['--redactor-self-test']],
    ['env-sync.mjs',['--self-test']],['release-package.mjs',['--self-test']],
    ['stablepoint-cd.mjs',['--self-test']],['stablepoint-inspect.mjs',['--self-test']]];
  for(const [name,args] of tests)await execute(name,args);
  const snap=snapshotSource(root);
  if(snap.files<8)error('Local source fingerprint failed');
  console.log(`LOCAL SELF-TEST PASS: ${tests.length} suites; source snapshot ${snap.files} files; no remote deployment.`);
}
function status() {
  const snap=snapshotSource(root);
  console.log(`Source root: ${root}\nLocal output: ${workspace}\nSource identity: ${snap.identityKind}\nWorking tree dirty: ${snap.dirty}\nFiles fingerprinted: ${snap.files}`);
  console.log('Stablepoint deployments: DISABLED (read-only inspection + synthetic simulation only)');
  const runs=recentResults().slice(0,6);
  if(!runs.length){console.log('No completed local CI runs.');return;}
  console.log('\nRecent CI runs:');
  for(const r of runs)console.log(`  ${r.id} | ${r.scope}/${r.operation} | ${r.status} | ${r.durationMs}ms`);
}
async function main(){
  const [cmd,...args]=process.argv.slice(2);
  if(!cmd||cmd==='help'||cmd==='--help'){help();return;}
  if(cmd==='ci')return ci(args);
  if(cmd==='package')return candidate(args);
  if(cmd==='status'){if(args.length)error('status accepts no options');status();return;}
  if(cmd==='self-test'){if(args.length)error('self-test accepts no options');return selfTest();}
  if(cmd==='cd'){
    if(args.length!==1||!['--plan','--simulate','--self-test'].includes(args[0]))error('CD supports only --plan, --simulate, --self-test');
    await execute('stablepoint-cd.mjs',args);return;
  }
  if(cmd==='ssh'){
    if(args.length!==2||args[0]!=='--inspect'||args[1]!=='--allow-readonly')error('SSH requires --inspect --allow-readonly (NO LIVE WRITES)');
    await execute('stablepoint-inspect.mjs',['--inspect']);return;
  }
  error(`Unknown local command: ${cmd}`);
}
main().catch(e=>{console.error(`Local DevOps ERROR: ${e.message}`);process.exitCode=1;});
