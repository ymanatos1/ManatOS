/**
 * The LOCAL adapter's one path contract. No machine-specific drive or cwd.
 * Defaults are loaded from devops/local/config.json, relative to cli.mjs.
 * GitHub CI does not import this module or use its output layout.
 */
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_LOCAL_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), '../local');
export const LOCAL_CONFIG_FILE = join(DEFAULT_LOCAL_DIRECTORY, 'config.json');

function properDirectory(path, allowMissing = false) {
  if (!existsSync(path)) {
    if (allowMissing) return;
    throw new Error(`Required local directory is missing: ${path}`);
  }
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`Local path must be a real directory, not a link/file: ${path}`);
  }
}
function isSubpath(base, child) {
  const rel = relative(base, child);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}
function checkConfig(config) {
  if (!config || config.schemaVersion !== 1) throw new Error('Unsupported local config version');
  const { projectRootFromLocal, sourceDirectory, releaseDirectory } = config;
  if (typeof projectRootFromLocal !== 'string' || !projectRootFromLocal.trim() ||
      isAbsolute(projectRootFromLocal) || /^[A-Za-z]:[\\/]/.test(projectRootFromLocal) ||
      projectRootFromLocal.startsWith('\\\\') || projectRootFromLocal.includes('\0')) {
    throw new Error('projectRootFromLocal must be a relative path from devops/local');
  }
  for (const [name, value] of Object.entries({ sourceDirectory, releaseDirectory })) {
    if (typeof value !== 'string' || !/^[\w.-]+$/.test(value) ||
        value === '.' || value === '..') {
      throw new Error(`${name} must be one simple directory name`);
    }
  }
  if (sourceDirectory.toLowerCase() === releaseDirectory.toLowerCase()) {
    throw new Error('Source and RELEASE directories must be distinct');
  }
  return config;
}
export function localReleasePaths({ localDirectory = DEFAULT_LOCAL_DIRECTORY, config } = {}) {
  const directory = resolve(localDirectory);
  const settings = checkConfig(config || JSON.parse(readFileSync(join(directory, 'config.json'), 'utf8')));
  const projectRoot = resolve(directory, settings.projectRootFromLocal);
  const source = resolve(projectRoot, settings.sourceDirectory);
  const release = resolve(projectRoot, settings.releaseDirectory);
  properDirectory(projectRoot);
  properDirectory(source);
  properDirectory(release, true);
  if (!isSubpath(projectRoot, source) || !isSubpath(projectRoot, release) ||
      isSubpath(source, release) || isSubpath(release, source)) {
    throw new Error('Unsafe source/RELEASE directory configuration');
  }
  return Object.freeze({
    projectRoot, source, release,
    work: join(release, 'work'),
    reports: join(release, 'ci', 'runs'),
    candidates: join(release, 'candidates'),
    packages: join(release, 'packages'), // Reserved until runtime-complete packages are verified.
    cd: join(release, 'cd'),
  });
}
/** Only create directories contained in the configured RELEASE root; reject links. */
export function ensureLocalDirectory(paths, target) {
  const absolute = resolve(target);
  if (!isSubpath(paths.release, absolute)) throw new Error(`Unsafe local output path: ${target}`);
  properDirectory(paths.projectRoot);
  properDirectory(paths.source);
  properDirectory(paths.release, true);
  if (!existsSync(paths.release)) mkdirSync(paths.release);
  properDirectory(paths.release);
  let cursor = paths.release;
  for (const segment of relative(paths.release, absolute).split(sep)) {
    if (!segment || segment === '.' || segment === '..') throw new Error('Invalid RELEASE path segment');
    cursor = join(cursor, segment);
    properDirectory(cursor, true);
    if (!existsSync(cursor)) mkdirSync(cursor);
    properDirectory(cursor);
  }
  return absolute;
}
export function ensureLocalWork(paths) { return ensureLocalDirectory(paths, paths.work); }

export function localReleasePathsSelfTest() {
  const base = mkdtempSync(join(tmpdir(), 'manatos-local-paths-test-'));
  const originalCwd = process.cwd();
  try {
    const local = join(base, 'ManatOS', 'src', 'devops', 'local');
    mkdirSync(local, { recursive: true });
    const config = { schemaVersion: 1, projectRootFromLocal: '../../..', sourceDirectory: 'src', releaseDirectory: 'RELEASE' };
    const p = localReleasePaths({ localDirectory: local, config });
    assert.equal(p.projectRoot, join(base, 'ManatOS'));
    assert.equal(p.source, join(base, 'ManatOS', 'src'));
    assert.equal(p.release, join(base, 'ManatOS', 'RELEASE'));
    assert.equal(p.reports, join(p.release, 'ci', 'runs'));
    assert.equal(p.candidates, join(p.release, 'candidates'));
    assert.equal(p.packages, join(p.release, 'packages'));
    assert(!existsSync(p.release), 'Status/preflight must not create RELEASE');
    ensureLocalWork(p);
    ensureLocalDirectory(p, p.reports);
    assert(existsSync(p.work) && existsSync(p.reports));
    assert(!existsSync(p.packages), 'Do not create deployable-package directory for candidates');
    assert.throws(() => ensureLocalDirectory(p, join(p.source, 'unsafe')), /Unsafe local output/);
    assert.throws(() => ensureLocalDirectory(p, p.release), /Unsafe local output/);
    // Move the whole project: every output path must follow without any hard-coded drive.
    const moved = join(base, 'OtherProject');
    mkdirSync(join(moved, 'app', 'devops', 'local'), { recursive: true });
    const movedConfig = { ...config, sourceDirectory: 'app' };
    const alt = localReleasePaths({ localDirectory: join(moved, 'app', 'devops', 'local'), config: movedConfig });
    assert.equal(alt.projectRoot, moved);
    assert.equal(alt.source, join(moved, 'app'));
    assert.equal(alt.release, join(moved, 'RELEASE'));
    assert.throws(() => localReleasePaths({ localDirectory: local, config: { ...config, releaseDirectory: '../src' } }), /simple directory/);
    assert.throws(() => localReleasePaths({ localDirectory: local, config: { ...config, sourceDirectory: 'RELEASE', releaseDirectory: 'RELEASE' } }), /distinct/);
    assert.throws(() => localReleasePaths({ localDirectory: local, config: { ...config, projectRootFromLocal: 'C:\\DEV\\ManatOS' } }), /relative path/);
    rmSync(p.release, { recursive: true });
    writeFileSync(p.release, 'file');
    assert.throws(() => localReleasePaths({ localDirectory: local, config }), /real directory/);
    process.chdir(base);
    assert.equal(localReleasePaths({ localDirectory: join(moved, 'app', 'devops', 'local'), config: movedConfig }).source, join(moved, 'app'));
    console.log('Local path self-test PASS: script-relative root, config override, relocation, path containment, no unexpected output.');
  } finally {
    process.chdir(originalCwd);
    rmSync(base, { recursive: true, force: true });
  }
}
