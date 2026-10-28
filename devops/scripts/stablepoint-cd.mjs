/**
 * ManatOS CD control and fault-injection simulator.
 * No remote deployment is supported. The simulated release is synthetic,
 * non-deployable and lives only in a temporary directory on the runner.
 * No application sources, environment credentials or network connections used.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, existsSync, lstatSync, readlinkSync,
  readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync,
  statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const configDir = resolve(scriptDir, '../config');
const policy = JSON.parse(readFileSync(join(configDir, 'stablepoint-policy.json'), 'utf8'));
const releasePolicy = JSON.parse(readFileSync(join(configDir, 'release-policy.json'), 'utf8'));
const SERVICES = Object.freeze(['api', 'ejs1', 'ng1']);
// Windows typically restricts directory symlinks to elevated/Developer Mode sessions.
// This is a LOCAL, SYNTHETIC simulator: emulate current-link switches with an
// atomically replaced pointer file on Windows, while retaining real links on Linux.
// Never use pointer files as a substitute for production Passenger release links.
const SIMULATED_POINTER_FILES = process.platform === 'win32' ||
  process.env.MANATOS_CD_SIM_LINK_MODE === 'pointer';
function createSimulatedLink(target, link) {
  if (SIMULATED_POINTER_FILES) {
    writeFileSync(link, `${target}\n`, {flag:'wx', mode:0o600});
  } else {
    symlinkSync(target, link, 'dir');
  }
}
function readSimulatedLink(link, service) {
  const st=lstatSync(link);
  if (!SIMULATED_POINTER_FILES) {
    assert(st.isSymbolicLink(), `Missing/suspicious current link: ${service}`);
    return readlinkSync(link);
  }
  assert(st.isFile() && !st.isSymbolicLink(), `Missing/suspicious current link: ${service}`);
  const content=readFileSync(link,'utf8');
  // Reject malformed, multiline or unbounded pointers before resolving targets.
  assert(content.endsWith('\n') && content.length<=4096 &&
    content.indexOf('\n')===content.length-1,
    `Unsafe current target: ${service}`);
  return content.slice(0,-1);
}
const fakeShaA = 'a'.repeat(40);
const fakeShaB = 'b'.repeat(40);
function fail(message) { throw new Error(message); }
function assert(condition, msg) { if (!condition) fail(msg); }
function expectFail(fn, contains) {
  try { fn(); } catch (e) {
    if (String(e.message).includes(contains)) return;
    throw new Error(`Expected error containing ${JSON.stringify(contains)}: ${e.message}`);
  }
  fail(`Expected refusal containing ${JSON.stringify(contains)}`);
}
function safeId(value) {
  assert(typeof value === 'string' && /^[a-f0-9]{40}$/.test(value), 'Invalid release identity');
  return value;
}
function pathWithin(base, child) {
  const root = resolve(base); const path = resolve(root, child);
  assert(path.startsWith(root + sep), 'Path escapes isolated CD root');
  return path;
}
function writeJSONAtomic(path, data) {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', {flag:'wx', mode:0o600});
  try { renameSync(tmp, path); } finally { rmSync(tmp, {force:true}); }
}
function assertPolicy() {
  assert(policy.schemaVersion === 1 && policy.deploymentEnabled === false &&
    policy.mode === 'READ_ONLY_INSPECTION_AND_LOCAL_SIMULATION', 'Real deployment must be disabled');
  assert(JSON.stringify(policy.services) === JSON.stringify(SERVICES), 'Unexpected production service set');
  assert(policy.legacyServicesExcluded.includes('ejs0'), 'EJS0 must be excluded');
  assert(policy.passenger.liveRestartEnabled === false && policy.health.simulateOnly === true &&
    policy.health.liveChecksConfigured === false && policy.data.migrationsEnabled === false &&
    policy.data.automaticDatabaseRestore === false &&
    policy.github.manualProductionDeploymentEnabled === false &&
    policy.github.automaticDeploymentEnabled === false, 'Unsafe CD policy');
  assert(releasePolicy.status === 'BUILD_CANDIDATE_NOT_DEPLOYABLE', 'Candidate release policy unexpectedly changed');
  assert(policy.releaseEligibility.rejectedTypes.includes(releasePolicy.status),
    'Candidate artifact rejection not enforced');
  assert(JSON.stringify(policy.health.requiredServices) === JSON.stringify(SERVICES), 'Health gate incomplete');
  assert(policy.data.persistentPathsExcludedFromReleases === true, 'Persistent data isolation disabled');
}
function confirmArtifact(manifest) {
  assert(manifest && typeof manifest === 'object', 'Artifact manifest required');
  if (manifest.status === 'BUILD_CANDIDATE_NOT_DEPLOYABLE' || manifest.deployable === false) {
    fail('Refusing non-deployable build candidate');
  }
  assert(manifest.status === policy.releaseEligibility.requiredType && manifest.deployable === true,
    'Artifact lacks verified deployable status');
  assert(manifest.ciGate === 'PASSED' && manifest.scope === 'all' && manifest.operation === 'verify',
    'Artifact lacks required CI verification');
  assert(manifest.runtimeDependenciesComplete === true && manifest.passengerValidated === true &&
    manifest.startupSmokeTestPassed === true, 'Missing runtime and Passenger validation');
  assert(manifest.testFixture === true, 'Only synthetic fixtures allowed in this CD simulator');
  safeId(manifest.sourceSha);
  assert(JSON.stringify(manifest.services) === JSON.stringify(SERVICES), 'Incomplete service manifest');
}
function simulationManifest(sha) {
  return { status:'DEPLOYABLE_VERIFIED', deployable:true, ciGate:'PASSED',
    scope:'all', operation:'verify', runtimeDependenciesComplete:true,
    passengerValidated:true, startupSmokeTestPassed:true, testFixture:true,
    sourceSha:safeId(sha), services:SERVICES };
}
function newFixture() {
  const root = mkdtempSync(join(tmpdir(), 'manatos-cd-sim-'));
  const dirs = ['releases','services','persistent','backups','logs','deployment-history'];
  for (const name of dirs) mkdirSync(pathWithin(root, name));
  for (const service of SERVICES) {
    const releaseDir = pathWithin(root, `releases/${service}/${fakeShaA}`);
    mkdirSync(releaseDir,{recursive:true});
    writeFileSync(join(releaseDir, 'marker.json'),JSON.stringify({service, sha:fakeShaA}));
    const appRoot = pathWithin(root, `services/${service}`);
    mkdirSync(join(appRoot,'tmp'),{recursive:true});
    createSimulatedLink(releaseDir,join(appRoot,'current'));
  }
  for (const name of ['persistent','backups','logs']) {
    writeFileSync(pathWithin(root,`${name}/DO_NOT_TOUCH`),`synthetic ${name} data`);
  }
  return root;
}
function active(root, service) {
  const current = pathWithin(root,`services/${service}/current`);
  const target=readSimulatedLink(current,service);
  // A release target may never point outside the exact component's releases.
  const expected = pathWithin(root,`releases/${service}`);
  assert(target.startsWith(expected + sep) && /^([a-f0-9]{40})$/.test(target.slice(expected.length + 1)) &&
    existsSync(target) && statSync(target).isDirectory(),`Unsafe current target: ${service}`);
  return target;
}
function switchLink(root, service, newTarget) {
  const expected = pathWithin(root,`releases/${service}`);
  assert(newTarget.startsWith(expected + sep) && existsSync(newTarget), 'Invalid release switch target');
  const appRoot = pathWithin(root,`services/${service}`);
  const tmp = join(appRoot,`.current-next-${process.pid}`);
  createSimulatedLink(newTarget,tmp);
  try { renameSync(tmp,join(appRoot,'current')); } finally { rmSync(tmp,{force:true}); }
}
function restartMock(root, service) {
  // Touch the marker under the mock Passenger application root, not releases.
  const marker = pathWithin(root,`services/${service}/tmp/restart.txt`);
  writeFileSync(marker,`synthetic restart: ${service}\n`);
}
function verifyUnmodifiedData(root) {
  for (const name of ['persistent','backups','logs']) {
    assert(readFileSync(pathWithin(root,`${name}/DO_NOT_TOUCH`),'utf8') === `synthetic ${name} data`,
      `Persistent data modified: ${name}`);
  }
}
function journal(root,id,record) {
  const path=pathWithin(root,`deployment-history/${id}.json`);
  writeJSONAtomic(path, record);
}
function executeSimulation(root, opts = {}) {
  assertPolicy();
  const manifest = opts.manifest || simulationManifest(fakeShaB);
  confirmArtifact(manifest);
  const selected = opts.services || SERVICES;
  assert(Array.isArray(selected) && selected.length && new Set(selected).size===selected.length &&
    selected.every(s=>SERVICES.includes(s)), 'Invalid service selection');
  const lock=pathWithin(root,'.deployment-lock');
  // Exclusive filesystem lock; stale locks require explicit investigation.
  try { mkdirSync(lock); } catch { fail('Deployment lock already held: manual investigation required'); }
  const id='simulation-'+manifest.sourceSha.slice(0,12);
  const record={format:'manatos.cd-simulation.v1', id, simulated:true, outcome:'IN_PROGRESS',
    sourceSha:manifest.sourceSha, steps:[], previous:{}, selected};
  const tick=(name,component='all')=>{
    record.steps.push({stage:name,component});journal(root,id,record);
    if(opts.failAfter===name && (opts.failService===undefined || opts.failService===component))
      throw new Error(`Injected failure after ${name}`);
  };
  let switched=false;
  try {
    // Preflight validates *all* live links before any staged state change.
    for(const service of selected) record.previous[service]=active(root,service);
    tick('PREFLIGHT');
    for(const service of selected) {
      const target=pathWithin(root,`releases/${service}/${manifest.sourceSha}`);
      assert(!existsSync(target),'Immutable release identity already staged');
      mkdirSync(target);
      writeFileSync(join(target,'marker.json'),JSON.stringify({service,sha:manifest.sourceSha,synthetic:true}));
      tick('STAGED',service);
    }
    // Never perform database migrations in Phase 2 simulation.
    tick('DB_MIGRATIONS_DISABLED');
    for(const service of selected) {
      const target=pathWithin(root,`releases/${service}/${manifest.sourceSha}`);
      switchLink(root,service,target);switched=true;tick('ACTIVATED',service);
      restartMock(root,service);tick('PASSENGER_RESTART_SIMULATED',service);
      if (opts.unhealthy === service) throw new Error(`Injected readiness failure: ${service}`);
      assert(active(root,service)===target,`Mock health gate failed: ${service}`);
      tick('HEALTHY',service);
    }
    // A release is accepted only after ALL components are healthy.
    record.outcome='SIMULATED_ACCEPTED';tick('ACCEPTED');
    verifyUnmodifiedData(root);
    return record;
  } catch (error) {
    record.failure=String(error.message);record.outcome='FAILED_ROLLBACK_REQUIRED';
    try {
      if(switched) {
        for(const service of selected) {
          const old=record.previous[service];
          if (active(root,service)!==old) {
            assert(existsSync(old),'Previous release missing: abort automatic rollback');
            switchLink(root,service,old);restartMock(root,service);
            record.steps.push({stage:'ROLLED_BACK',component:service});
          }
        }
      }
      record.outcome='SIMULATED_ROLLED_BACK';
    } catch(rollbackError) {
      record.rollbackFailure=String(rollbackError.message);
      record.outcome='FAILED_MANUAL_RECOVERY_REQUIRED';
    }
    journal(root,id,record);
    verifyUnmodifiedData(root);
    if(opts.throwOnFailure!==false) throw error;
    return record;
  } finally {
    rmSync(lock,{recursive:true,force:true});
  }
}
function verifySimulationRecord(root,record) {
  assert(record.simulated===true && record.format==='manatos.cd-simulation.v1', 'Not simulation evidence');
  const disk=JSON.parse(readFileSync(pathWithin(root,`deployment-history/${record.id}.json`),'utf8'));
  assert(disk.outcome===record.outcome,'Journal state mismatch');
  verifyUnmodifiedData(root);
}
function selfTest() {
  let checks=0;
  function caseRun(name,body) {
    const root=newFixture();
    try {body(root);checks++;} finally {rmSync(root,{recursive:true,force:true});}
  }
  caseRun('normal',root=>{
    const r=executeSimulation(root);assert(r.outcome==='SIMULATED_ACCEPTED','Not accepted');
    assert(r.steps.filter(s=>s.stage==='HEALTHY').length===3,'Health gates incomplete');
    for(const svc of SERVICES)assert(active(root,svc).endsWith(fakeShaB),'Release not activated');
    verifySimulationRecord(root,r);
  });
  for(const phase of ['PREFLIGHT','STAGED','ACTIVATED','PASSENGER_RESTART_SIMULATED','HEALTHY']) {
    caseRun(phase,root=>{
      const r=executeSimulation(root,{failAfter:phase,failService:phase==='PREFLIGHT'?undefined:'api',throwOnFailure:false});
      assert(r.outcome==='SIMULATED_ROLLED_BACK',`Rollback failed after ${phase}`);
      for(const svc of SERVICES)assert(active(root,svc).endsWith(fakeShaA),`Rollback missed ${svc}`);
      verifySimulationRecord(root,r);
    });
  }
  caseRun('unhealthy',root=>{
    const r=executeSimulation(root,{unhealthy:'ejs1',throwOnFailure:false});
    assert(r.outcome==='SIMULATED_ROLLED_BACK','Unhealthy did not roll back');
    for(const svc of SERVICES)assert(active(root,svc).endsWith(fakeShaA),'Mixed version after failed health');
    verifySimulationRecord(root,r);
  });
  caseRun('candidate-rejected',root=>expectFail(()=>executeSimulation(root,{
    manifest:{status:'BUILD_CANDIDATE_NOT_DEPLOYABLE',deployable:false}}),'non-deployable'));
  caseRun('incomplete-artifact',root=>expectFail(()=>executeSimulation(root,{
    manifest:{...simulationManifest(fakeShaB), runtimeDependenciesComplete:false}}),'Missing runtime'));
  caseRun('traversal',root=>expectFail(()=>pathWithin(root,'../outside'),'escapes'));
  caseRun('symlink-escape',root=>{
    const link=pathWithin(root,'services/api/current');rmSync(link);
    createSimulatedLink('/tmp',link);
    expectFail(()=>executeSimulation(root),'Unsafe current target');
  });
  caseRun('invalid-link-format',root=>{
    const link=pathWithin(root,'services/api/current');
    rmSync(link);
    // Real Linux links must never be replaced by a file; portable pointers
    // must reject malformed or multiline contents before any state change.
    writeFileSync(link,'invalid\nforged\n');
    expectFail(()=>executeSimulation(root),
      SIMULATED_POINTER_FILES?'Unsafe current target':'Missing/suspicious current link');
  });
  caseRun('lock-contention',root=>{
    mkdirSync(pathWithin(root,'.deployment-lock'));
    expectFail(()=>executeSimulation(root),'lock already held');
  });
  caseRun('immutable-collision',root=>{
    mkdirSync(pathWithin(root,`releases/api/${fakeShaB}`));
    expectFail(()=>executeSimulation(root),'already staged');
  });
  caseRun('service-scope',root=>{
    const r=executeSimulation(root,{services:['api']});
    assert(r.outcome==='SIMULATED_ACCEPTED','Single-service update failed');
    assert(active(root,'ejs1').endsWith(fakeShaA),'Unrelated service changed');
  });
  caseRun('service-reject',root=>expectFail(()=>executeSimulation(root,{services:['ejs0']}),'Invalid service'));
  caseRun('missing-policy',root=>expectFail(()=>confirmArtifact({}), 'Artifact lacks'));
  console.log(`Stablepoint CD self-test PASS: ${checks} simulated scenarios (${SIMULATED_POINTER_FILES?'portable pointer':'native symlink'} backend); real deployment disabled.`);
  console.log('Covered immutable releases, lock contention, Passenger restart markers, all-service health, failures, rollback, data isolation, prohibited artifacts and EJS0.');
}
function plan() {
  assertPolicy();
  const view={target:policy.target,mode:policy.mode,deploymentEnabled:false,
    services:SERVICES,requiredArtifactStatus:policy.releaseEligibility.requiredType,
    currentCandidateStatus:releasePolicy.status,
    releaseCandidateDeployable:false,
    phases:['preflight','artifact verification','exclusive lock','stage immutable releases',
      'migration safety check (disabled)','atomic per-service switch','Passenger restart',
      'readiness/smoke checks','accept or rollback','journal'],
    liveHostMutations:false,productionHealthConfigured:false,
    productionReadiness:'BLOCKED: production runtime closure and host validation incomplete'};
  console.log(JSON.stringify(view,null,2));
}
const op=process.argv.slice(2);
try {
  if (op.length!==1) fail('Usage: node stablepoint-cd.mjs --self-test | --plan | --simulate');
  if(op[0]==='--self-test') selfTest();
  else if(op[0]==='--plan') plan();
  else if(op[0]==='--simulate') {
    const root=newFixture();
    try {
      const record=executeSimulation(root);
      console.log(JSON.stringify({outcome:record.outcome,simulated:true,services:record.selected,
        stages:record.steps.map(x=>x.stage)},null,2));
    } finally {rmSync(root,{recursive:true,force:true});}
  } else fail('Unsupported command: real deploy/activate/rollback are disabled');
} catch(e) {console.error(`Stablepoint CD ERROR: ${e.message}`);process.exitCode=1;}
