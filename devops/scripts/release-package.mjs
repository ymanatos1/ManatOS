/**
 * ManatOS compiled release-candidate packager.
 * NOT a production deployer: runtime node_modules and Passenger startup closure
 * are intentionally not claimed until verified against the future application.
 * No external npm modules are required; shared portable Node archive code
 * produces identical candidates on Windows CMD and GitHub Linux runners.
 */
import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDeterministicArchive, inspectDeterministicArchive } from '../core/archive.mjs';

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const policy = JSON.parse(readFileSync(resolve(scriptRoot, '../config/release-policy.json'), 'utf8'));
const keys = new Set(['--source-root', '--output-dir', '--sha', '--ci-report', '--archive']);
const flags = new Set(['--package', '--verify', '--self-test']);
const args = process.argv.slice(2);
const opts = {};
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (flags.has(arg)) { opts[arg] = true; continue; }
  if (!keys.has(arg) || !args[i + 1] || args[i + 1].startsWith('--')) {
    throw new Error(`Unknown or incomplete option: ${arg}`);
  }
  opts[arg] = args[++i];
}
function fail(message) { throw new Error(message); }
function sha256(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
function fileSha(file) { return sha256(readFileSync(file)); }
function safePath(path) {
  if (typeof path !== 'string' || !path || path.includes('\\') || isAbsolute(path) ||
    path.split('/').some((part) => !part || part === '.' || part === '..') || /[\x00-\x1f]/.test(path)) {
    fail(`Unsafe release path: ${JSON.stringify(path)}`);
  }
  return path;
}
function sensitivePath(path) {
  return path.split('/').some((part) =>
    /^\.env(?:\.|$)/i.test(part) || /^(?:node_modules|\.git)$/i.test(part) ||
    /\.(?:pem|key|p12|pfx|map)$/i.test(part) ||
    /^(?:id_rsa|id_ed25519|credentials\.json|secrets?\.json)$/i.test(part));
}
function filesUnder(root, relPath) {
  safePath(relPath);
  const dir = resolve(root, relPath);
  if (!existsSync(dir)) fail(`Missing required build output: ${relPath}`);
  function walk(abs, rel) {
    const info = lstatSync(abs);
    if (info.isSymbolicLink()) fail(`Symlinks prohibited in candidate payload: ${rel}`);
    if (sensitivePath(rel)) fail(`Sensitive file in candidate payload: ${rel}`);
    if (info.isFile()) return [rel];
    if (!info.isDirectory()) fail(`Unsupported file type in candidate payload: ${rel}`);
    return readdirSync(abs).sort().flatMap((entry) => walk(join(abs, entry), `${rel}/${entry}`));
  }
  const result = walk(dir, relPath);
  if (!result.length) fail(`Empty required build output: ${relPath}`);
  return result;
}
function confirmRequired(sourceRoot) {
  if (policy.schemaVersion !== 1 || policy.status !== 'BUILD_CANDIDATE_NOT_DEPLOYABLE') {
    fail('Unsupported or deployable release policy');
  }
  const expected = ['shared','shared.UI','shared.UI.NG','shared.UI.EJS','api','ui.NG1','ui.EJS1'];
  if (JSON.stringify(policy.productionWorkspaces) !== JSON.stringify(expected)) {
    fail('Unexpected production workspace contract');
  }
  for (const ws of expected) {
    const manifest = resolve(sourceRoot, ws, 'package.json');
    if (!existsSync(manifest)) fail(`Missing required workspace: ${ws}`);
    JSON.parse(readFileSync(manifest, 'utf8'));
  }
  for (const path of ['package.json', 'package-lock.json']) {
    if (!existsSync(resolve(sourceRoot, path))) fail(`Missing required lockfile or manifest: ${path}`);
  }
  if (!policy.packages.api || !policy.packages.ejs1 || !policy.packages.ng1 ||
    Object.keys(policy.packages).length !== 3) fail('Exactly three production components required');
}
function verifyCiGate(ciReportPath, sha) {
  if (!ciReportPath) fail('A completed CI report is mandatory');
  const report = JSON.parse(readFileSync(ciReportPath, 'utf8'));
  if (report.sourceFingerprint !== undefined && report.sourceFingerprint !== null &&
      !/^[a-f0-9]{64}$/.test(report.sourceFingerprint)) fail('Invalid local source fingerprint');
  if (report.status !== 'PASSED' || report.scope !== policy.requiredScope ||
      report.operation !== policy.requiredOperation || report.sha !== sha ||
      !Array.isArray(report.steps) || !report.steps.length ||
      report.steps.some((step) => step.status !== 'PASSED')) {
    fail('Refusing package: no matching successful all/verify CI evidence');
  }
  return report;
}
async function packageCandidate(sourceRoot, outputDir, sha, ciReportPath) {
  if (!/^[a-f0-9]{40}$/.test(sha || '')) fail('Git SHA must be exactly 40 lowercase hexadecimal characters');
  confirmRequired(sourceRoot);
  const ciReport = verifyCiGate(ciReportPath, sha);
  const out = resolve(outputDir);
  const root = resolve(sourceRoot);
  if (out === root || out.startsWith(`${root}${sep}`)) {
    fail('Candidate output must be outside the application source tree');
  }
  mkdirSync(out, { recursive: true });
  const scratch = mkdtempSync(join(tmpdir(), 'manatos-candidate-'));
  const result = [];
  try {
    for (const [component, selected] of Object.entries(policy.packages)) {
      const stage = join(scratch, component);
      mkdirSync(stage);
      const entries = new Set();
      for (const path of selected) {
        for (const entry of filesUnder(root, path)) entries.add(entry);
      }
      const entryPoint = policy.requiredEntryPoints[component];
      if (!entries.has(entryPoint)) fail(`Missing verified entrypoint: ${entryPoint}`);
      const inventory = [];
      for (const relPath of [...entries].sort()) {
        if (sensitivePath(relPath)) fail(`Sensitive path selected: ${relPath}`);
        const origin = resolve(root, safePath(relPath));
        if (!lstatSync(origin).isFile()) fail(`Candidate entry is not a regular file: ${relPath}`);
        const destination = resolve(stage, relPath);
        mkdirSync(dirname(destination), { recursive: true });
        cpSync(origin, destination, { dereference: false });
        inventory.push({ path: relPath, bytes: statSync(origin).size, sha256: fileSha(origin) });
      }
      const manifest = {
        format: 'manatos.build-candidate.v1', component,
        deployable: false, status: policy.status, sourceSha: sha,
        lockSha256: fileSha(resolve(root, 'package-lock.json')),
        sourceFingerprint: ciReport.sourceFingerprint || null,
        sourceIdentityKind: ciReport.sourceIdentityKind || 'github-commit',
        localSourceDirty: ciReport.localSourceDirty === true,
        entryPoint, files: inventory,
        missingRuntimeRequirements: [
          'Production node_modules/dependency closure not included',
          'Stablepoint Passenger startup and application environment not validated',
          'Production runtime smoke test and persistent paths not validated',
        ],
      };
      writeFileSync(join(stage, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
      const archiveName = `manatos-${component}-${sha.slice(0, 12)}.tar.gz`;
      const archivePath = join(scratch, archiveName);
      await createDeterministicArchive(stage, archivePath);
      const archiveSha = fileSha(archivePath);
      writeFileSync(`${archivePath}.sha256`, `${archiveSha}  ${archiveName}\n`);
      await validateCandidate(archivePath);
      result.push({ component, archive: archiveName, sha256: archiveSha, files: inventory.length,
        bytes: statSync(archivePath).size, deployable: false });
    }
    const summary = {
      format: 'manatos.candidate-set.v1', deployable: false, status: policy.status,
      sourceSha: sha, sourceFingerprint: ciReport.sourceFingerprint || null,
      sourceIdentityKind: ciReport.sourceIdentityKind || 'github-commit',
      localSourceDirty: ciReport.localSourceDirty === true, components: result,
    };
    // All candidates must be complete and verified before publishing any output.
    // An existing immutable SHA-identified candidate may be reused only if identical.
    for (const entry of result) {
      const dst = join(out, entry.archive);
      if (existsSync(dst) && fileSha(dst) !== entry.sha256) {
        fail(`Immutable candidate collision: ${entry.archive}`);
      }
    }
    const summaryPath = join(out, 'release-set.json');
    const serialized = `${JSON.stringify(summary, null, 2)}\n`;
    if (existsSync(summaryPath) && readFileSync(summaryPath, 'utf8') !== serialized) {
      fail('Immutable release-set collision');
    }
    for (const entry of result) {
      for (const suffix of ['', '.sha256']) {
        const filename = `${entry.archive}${suffix}`;
        const dst = join(out, filename);
        if (!existsSync(dst)) {
          cpSync(join(scratch, filename), dst, { errorOnExist: true, force: false });
        } else if (fileSha(dst) !== fileSha(join(scratch, filename))) {
          fail(`Candidate sidecar collision: ${filename}`);
        }
      }
    }
    if (!existsSync(summaryPath)) writeFileSync(summaryPath, serialized, { flag: 'wx' });
    return summary;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
async function validateCandidate(archivePath) {
  const archive = resolve(archivePath);
  if (!archive.endsWith('.tar.gz')) fail('Expected .tar.gz candidate archive');
  const checksumPath = `${archive}.sha256`;
  if (!existsSync(checksumPath)) fail('Missing archive SHA-256 sidecar');
  const sidecar = readFileSync(checksumPath, 'utf8').trim().split(/\s+/);
  if (sidecar.length !== 2 || sidecar[1] !== basename(archive) ||
    sidecar[0] !== fileSha(archive)) fail('Archive SHA-256 verification failed');
  const entries = await inspectDeterministicArchive(archive);
  const raw = entries.get('release-manifest.json')?.content;
  if (!raw) fail('Archive lacks a valid release manifest');
  const manifest = JSON.parse(raw);
  if (manifest.format !== 'manatos.build-candidate.v1' || manifest.deployable !== false ||
      manifest.status !== policy.status || !/^[a-f0-9]{40}$/.test(manifest.sourceSha) ||
      !policy.packages[manifest.component]) fail('Invalid candidate manifest');
  const expected = new Set(['release-manifest.json']);
  for (const entry of manifest.files) {
    safePath(entry.path);
    if (sensitivePath(entry.path) || expected.has(entry.path)) fail(`Unexpected candidate file: ${entry.path}`);
    expected.add(entry.path);
    const found = entries.get(entry.path);
    if (!found || found.sha256 !== entry.sha256 || found.size !== entry.bytes) {
      fail(`Candidate file integrity failed: ${entry.path}`);
    }
  }
  if (entries.size !== expected.size || [...entries.keys()].some((f) => !expected.has(f))) {
    fail('Candidate archive includes unmanifested files');
  }
  if (!expected.has(manifest.entryPoint) || !/^[a-f0-9]{64}$/.test(manifest.lockSha256)) {
    fail('Candidate startup or lockfile integrity failed');
  }
  return manifest;
}
async function selfTest() {
  const base = mkdtempSync(join(tmpdir(), 'manatos-candidate-test-'));
  const source = join(base, 'src');
  const output = join(base, 'out');
  const sha = 'a'.repeat(40);
  function put(path, value = 'fixture\n') {
    const target = join(source, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, value);
  }
  try {
    put('package.json', '{}');
    put('package-lock.json', '{"lockfileVersion":3}');
    for (const ws of policy.productionWorkspaces) put(`${ws}/package.json`, '{}');
    for (const entries of Object.values(policy.packages)) {
      for (const rel of entries) {
        if (rel.endsWith('/package.json')) continue;
        if (rel.endsWith('/dist') || rel.endsWith('/public') || rel.endsWith('/views') || rel.endsWith('/dist-host') ||
          rel.endsWith('/browser')) put(`${rel}/fixture.js`);
        else if (!rel.endsWith('/package.json')) put(rel);
      }
    }
    for (const entryPoint of Object.values(policy.requiredEntryPoints)) put(entryPoint, 'console.log("ok")\n');
    put('api/.env', 'SHOULD_NOT_APPEAR=secret\n');
    put('ui.EJS0/dist/unwanted.js', 'legacy\n');
    const reportPath = join(base, 'result.json');
    writeFileSync(reportPath, JSON.stringify({ status: 'PASSED', scope: 'all', operation: 'verify', sha,
      steps: [{ status: 'PASSED' }] }));
    const result = await packageCandidate(source, output, sha, reportPath);
    if (result.components.length !== 3) fail('Expected three candidate components');
    for (const item of result.components) {
      const archive = join(output, item.archive);
      const manifest = await validateCandidate(archive);
      if (manifest.files.some((f) => /\.env|ui\.EJS0/i.test(f.path))) fail('Secret or EJS0 leak');
      const old = fileSha(archive);
      await packageCandidate(source, output, sha, reportPath);
      if (fileSha(archive) !== old) fail('Candidate archives are not deterministic');
    }
    // Tampering must be reported even if archive is otherwise well-formed.
    const firstArchive = join(output, result.components[0].archive);
    const original = readFileSync(firstArchive);
    writeFileSync(firstArchive, Buffer.concat([original, Buffer.from('tampering')]));
    try { await validateCandidate(firstArchive); fail('Tampered candidate accepted'); }
    catch (error) { if (error.message === 'Tampered candidate accepted') throw error; }
    // SHA-addressed outputs are immutable: changed bytes may not overwrite an existing candidate.
    try { await packageCandidate(source, output, sha, reportPath); fail('Immutable collision accepted'); }
    catch (error) { if (error.message === 'Immutable collision accepted') throw error; }
    writeFileSync(firstArchive, original);
    await validateCandidate(firstArchive);

    // It is never permissible to package a private config, even nested in a selected static directory.
    put('ui.EJS1/public/.env.backup', 'TEST_SECRET=hidden\n');
    try { await packageCandidate(source, output, sha, reportPath); fail('Secret path accepted'); }
    catch (error) { if (error.message === 'Secret path accepted') throw error; }
    rmSync(join(source, 'ui.EJS1/public/.env.backup'));

    writeFileSync(reportPath, JSON.stringify({status:'PASSED',scope:'uis',operation:'verify',sha,
      steps:[{status:'PASSED'}]}));
    try { await packageCandidate(source, output, sha, reportPath); fail('Partial CI accepted'); }
    catch (error) { if (error.message === 'Partial CI accepted') throw error; }
    writeFileSync(reportPath, JSON.stringify({status:'FAILED',scope:'all',operation:'verify',sha,
      steps:[{status:'FAILED'}]}));
    try { await packageCandidate(source, output, sha, reportPath); fail('Failed gate accepted'); }
    catch (error) { if (error.message === 'Failed gate accepted') throw error; }
    writeFileSync(reportPath, JSON.stringify({status:'PASSED',scope:'all',operation:'verify',sha,
      steps:[{status:'PASSED'}]}));
    rmSync(join(source, 'api/dist/server.js'));
    try { await packageCandidate(source, output, sha, reportPath); fail('Missing entrypoint accepted'); }
    catch (error) { if (error.message === 'Missing entrypoint accepted') throw error; }
    console.log('Release-candidate self-test passed: deterministic archives, all/verify gate, checksum/tamper detection, immutable releases, missing output, EJS0/.env exclusion.');
  } finally { rmSync(base, { recursive: true, force: true }); }
}
if (opts['--self-test']) await selfTest();
else if (opts['--package']) {
  if (!opts['--source-root'] || !opts['--output-dir']) fail('Missing --source-root or --output-dir');
  const result = await packageCandidate(opts['--source-root'], opts['--output-dir'], opts['--sha'], opts['--ci-report']);
  console.log(JSON.stringify(result, null, 2));
} else if (opts['--verify']) {
  if (!opts['--archive']) fail('Missing --archive');
  const manifest = await validateCandidate(opts['--archive']);
  console.log(`Verified ${manifest.component} candidate for ${manifest.sourceSha} (NOT deployable).`);
} else fail('Specify --package, --verify, or --self-test');
