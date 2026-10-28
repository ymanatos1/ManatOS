#!/usr/bin/env node
/** Local ManatOS DevOps command-line adapter. Works directly in Windows CMD.
 * Calls the same DevOps scripts used by GitHub Actions. No PowerShell, no live CD.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, fstatSync, lstatSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync,
  rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { snapshotSource } from '../core/source-snapshot.mjs';
import { localReleasePaths, ensureLocalDirectory, ensureLocalWork, localReleasePathsSelfTest } from '../core/local-paths.mjs';
import { createLineRenderer, printLine, terminalSelfTest } from './terminal.mjs';

const paths=localReleasePaths();
const root=paths.source;
const policy=JSON.parse(readFileSync(join(root,'devops/config/env-policy.json'),'utf8'));
const workspace=paths.release;
const reports=paths.reports;
const releases=paths.candidates;
const scripts=join(root,'devops/scripts');
const ciOperations=['verify','quality','lint','build','test'];
const scopes=['all','api','uis','ng1','ejs1'];
function error(s){throw new Error(s);}
function out(message) { for (const line of String(message).split('\n')) printLine(line); }
function options(argv,allowed=[]) {
  const o={};
  for(let i=0;i<argv.length;i++) {
    const a=argv[i];
    if(!allowed.includes(a)||Object.hasOwn(o,a))error(`Unsupported or duplicate option: ${a}`);
    if(['--plan','--preflight','--allow-readonly','--last'].includes(a)){o[a]=true;continue;}
    if(!argv[i+1]||argv[i+1].startsWith('--'))error(`Missing value after ${a}`);
    o[a]=argv[++i];
  }
  return o;
}
function check(value,allowed,label){if(!allowed.includes(value))error(`Unsupported ${label}: ${value}`);return value;}
async function execute(script,args=[],settings={}) {
  const file=join(scripts,script);
  if(!existsSync(file))error(`Missing DevOps engine script: ${script}`);
  ensureLocalWork(paths);
  const started=Date.now();
  out(`\n>> ${script} ${args.filter(x=>!x.startsWith('--sha')).join(' ')}`);
  const exit=await new Promise((done,reject)=>{
    const child=spawn(process.execPath,[file,...args],{
      // Preserve the caller's OS environment for application checks. In particular,
      // do not override TEMP/TMP/TMPDIR: tests and their workers must see the same
      // environment as a direct `npm run test --workspace ...` invocation.
      // DevOps-owned scratch files use the explicit RELEASE/work path separately.
      cwd:root,stdio:['inherit','pipe','pipe'],windowsHide:true,env:{...process.env,
        MANATOS_DEVOPS_TEMP_ROOT:paths.work,...settings}
    });
    const stdout=createLineRenderer(process.stdout);
    const stderr=createLineRenderer(process.stderr);
    child.stdout.on('data',chunk=>stdout.write(chunk));
    child.stderr.on('data',chunk=>stderr.write(chunk));
    child.on('error',reject);
    child.on('close',(code)=>{
      stdout.end();
      stderr.end();
      done(code===null?1:code);
    });
  });
  out(`<< ${script}: ${exit===0?'PASS':'FAIL'} (${((Date.now()-started)/1000).toFixed(1)}s)`);
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
  out(`ManatOS.DevOps local CLI — Windows CMD / Node.js (NO PowerShell)\n\n`+
    `  node devops\\local\\cli.mjs self-test\n`+
    `  node devops\\local\\cli.mjs status\n`+
    `  node devops\\local\\cli.mjs logs [--last|--run RUN_ID] [--step N --tail 40]\n`+
    `  node devops\\local\\cli.mjs ci --scope all --operation verify\n`+
    `  node devops\\local\\cli.mjs ci --scope all --operation verify --plan\n`+
    `  node devops\\local\\cli.mjs ci --scope all --preflight\n`+
    `  node devops\\local\\cli.mjs package [--run RUN_ID]\n`+
    `  node devops\\local\\cli.mjs package --verify ARCHIVE_PATH\n`+
    `  node devops\\local\\cli.mjs cd --plan|--simulate|--self-test\n`+
    `  node devops\\local\\cli.mjs ssh --inspect --allow-readonly\n\n`+
    `  No EJS0, no Prettier. No production deployment commands exist.\n`+
    `  Project root: ${paths.projectRoot}\n`+
    `  Source root: ${root}\n`+
    `  RELEASE working directory: ${workspace}\n`+
    `  Candidates: ${releases}\n`+
    `  Stablepoint packages (reserved): ${paths.packages}\n`);
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
  ensureLocalDirectory(paths,dir);
  ensureLocalWork(paths);
  const temp=mkdtempSync(join(paths.work,'manatos-local-redaction-'));
  const secrets=join(temp,'redactions.json');
  writeFileSync(secrets,JSON.stringify(privateRedactions(scope)),{flag:'wx',mode:0o600});
  try {
    await execute('devops-ci.mjs',['--scope',scope,'--operation',operation],{
      MANATOS_CI_REPORT_DIR:dir,MANATOS_CI_REDACTIONS_FILE:secrets,
      MANATOS_CI_CONSOLE_BRIEF:'1',
      MANATOS_SOURCE_SHA:source.sourceSha,
      MANATOS_LOCAL_SOURCE_FINGERPRINT:source.fingerprint,
      MANATOS_LOCAL_SOURCE_DIRTY:String(source.dirty),
      MANATOS_LOCAL_SOURCE_IDENTITY_KIND:source.identityKind,
    });
  } finally {
    rmSync(temp,{recursive:true,force:true});
    out(`CI reports: ${dir}`);
    out(`Source: ${source.identityKind}; dirty=${source.dirty}; ${source.files} fingerprinted files`);
  }
}
/** Inspect captured CI evidence without dumping the full test transcript into CMD.
 * Never interpret a path from result.json or user input as a filesystem path.
 */
function logs(argv) {
  const opt=options(argv,['--last','--run','--step','--tail']);
  if (opt['--last'] && opt['--run']) error('Use --last or --run, not both');
  if (opt['--tail'] && !opt['--step']) error('--tail requires --step');
  const runs=recentResults();
  if (!runs.length) {out(`No CI reports yet. Directory: ${reports}`);return;}
  if (!opt['--last'] && !opt['--run'] && !opt['--step']) {
    out(`Recent local CI runs (reports: ${reports}):`);
    for(const run of runs.slice(0,15))out(`  ${run.id} | ${run.scope}/${run.operation} | ${run.status} | ${(run.durationMs/1000).toFixed(1)}s`);
    out('For details: node devops\\local\\cli.mjs logs --last');
    return;
  }
  const selected=opt['--run'] ? runs.find(r=>r.id===opt['--run']) : runs[0];
  if (!selected) error('Unknown CI run ID; use logs to list recorded runs');
  const dir=join(reports,selected.id);
  const summary=join(dir,'summary.md');
  out(`CI run: ${selected.id} (${selected.status}, ${selected.scope}/${selected.operation})`);
  out(`Report directory: ${dir}`);
  if (existsSync(summary)) {
    const contents=readFileSync(summary,'utf8');
    out(`\n${contents.slice(0,30000)}`);
  }
  const steps=Array.isArray(selected.steps)?selected.steps:[];
  if (opt['--step']) {
    const step=Number(opt['--step']);
    if (!Number.isSafeInteger(step)||step<1||step>steps.length)error(`--step must be 1..${steps.length}`);
    const logfile=join(dir,`step-${String(step).padStart(2,'0')}.log`);
    if (!existsSync(logfile))error(`No saved output for step ${step}: ${steps[step-1].status}`);
    out(`Step ${step}: ${steps[step-1].label} (${steps[step-1].status})`);
    out(`Full log: ${logfile}`);
    const count=opt['--tail']?Number(opt['--tail']):40;
    if (!Number.isSafeInteger(count)||count<1||count>200)error('--tail must be 1..200');
    const fd=openSync(logfile,'r');
    let text;
    try {
      const size=fstatSync(fd).size;
      const length=Math.min(size,512*1024);
      const buffer=Buffer.alloc(length);
      let read=0;
      while(read<length){const n=readSync(fd,buffer,read,length-read,size-length+read);if(n<=0)break;read+=n;}
      text=buffer.subarray(0,read).toString('utf8');
      if (size>length)text=text.slice(text.indexOf('\n')+1);
    }finally{closeSync(fd);}
    const last=text.split(/\r?\n/).slice(-count).join('\n');
    out(`\nLast ${count} lines:\n${stripVTControlCharacters(last)}`);
  } else {
    out('Step logs:');
    for(let i=0;i<steps.length;i++){
      const name=`step-${String(i+1).padStart(2,'0')}.log`;
      out(`  ${i+1}. ${steps[i].label}: ${steps[i].status}${existsSync(join(dir,name))?` — ${name}`:''}`);
    }
    out('Show a saved step: node devops\\local\\cli.mjs logs --last --step 9 --tail 50');
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
  const outputDir=join(releases,item.id);
  ensureLocalDirectory(paths,outputDir);
  await execute('release-package.mjs',['--package','--source-root',root,
    '--output-dir',outputDir,'--sha',item.sha,'--ci-report',item.file,'--layout','per-app']);
  out(`Compiled candidates only: ${outputDir}\nNOT DEPLOYABLE — runtime dependencies and Passenger validation are outstanding.`);
}
async function selfTest() {
  terminalSelfTest();
  localReleasePathsSelfTest();
  const tests=[['devops-ci.mjs',['--redactor-self-test']],
    ['env-sync.mjs',['--self-test']],['release-package.mjs',['--self-test']],
    ['stablepoint-cd.mjs',['--self-test']],['stablepoint-inspect.mjs',['--self-test']]];
  for(const [name,args] of tests)await execute(name,args);
  const snap=snapshotSource(root);
  if(snap.files<8)error('Local source fingerprint failed');
  out(`LOCAL SELF-TEST PASS: ${tests.length+2} suites; source snapshot ${snap.files} files; no remote deployment.`);
}
function status() {
  const snap=snapshotSource(root);
  out(`Project root: ${paths.projectRoot}\nSource root: ${root}\nRELEASE workspace: ${workspace}\nCI reports: ${reports}\nNon-deployable candidates: ${releases}\nStablepoint packages (reserved): ${paths.packages}\nSource identity: ${snap.identityKind}\nWorking tree dirty: ${snap.dirty}\nFiles fingerprinted: ${snap.files}`);
  out('Stablepoint deployments: DISABLED (read-only inspection + synthetic simulation only)');
  const runs=recentResults().slice(0,6);
  if(!runs.length){out('No completed local CI runs.');return;}
  out('\nRecent CI runs:');
  for(const r of runs)out(`  ${r.id} | ${r.scope}/${r.operation} | ${r.status} | ${r.durationMs}ms`);
}
async function main(){
  const [cmd,...args]=process.argv.slice(2);
  if(!cmd||cmd==='help'||cmd==='--help'){help();return;}
  if(cmd==='ci')return ci(args);
  if(cmd==='package')return candidate(args);
  if(cmd==='status'){if(args.length)error('status accepts no options');status();return;}
  if(cmd==='logs')return logs(args);
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
main().catch(e=>{printLine(`Local DevOps ERROR: ${e.message}`, process.stderr);process.exitCode=1;});
