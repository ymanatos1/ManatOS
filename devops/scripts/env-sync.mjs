#!/usr/bin/env node
/**
 * ManatOS GitHub CI environment synchronization.
 * Source of truth: the four LOCAL .env files (never .env.example).
 * Each application's exact .env contents are stored as one encrypted GitHub
 * Actions secret, not as committed files, job output, or artifacts.
 *
 * Preview: node devops/scripts/env-sync.mjs --repo OWNER/ManatOS
 * Apply:   node devops/scripts/env-sync.mjs --repo OWNER/ManatOS --apply
 * Runner:  node devops/scripts/env-sync.mjs --restore-ci --scope all
 * Cleanup: node devops/scripts/env-sync.mjs --cleanup-ci
 */
import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const POLICY = JSON.parse(readFileSync(join(PROJECT_ROOT, 'devops/config/env-policy.json'), 'utf8'));
const STATE_DIR = join(homedir(), '.config', 'manatos-devops');
const STATE_FILE = join(STATE_DIR, 'env-sync-state.json');
const KEY_FILE = join(STATE_DIR, 'env-sync-local-key');
const APP_IDS = new Set(POLICY.applications.map((app) => app.id));
const REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const SECRET_MAX_BYTES = 48 * 1024;

function fail(message) {
  throw new Error(message);
}
function requireSafePolicy() {
  if (POLICY.version !== 1 || POLICY.githubTarget !== 'repository-actions-secrets') fail('Unsupported env-policy.json version/target');
  const paths = new Set();
  const secrets = new Set();
  const indexes = new Set();
  for (const app of POLICY.applications) {
    if (!/^[a-z0-9]+$/.test(app.id) || !/^[A-Z0-9_]+$/.test(app.secret) || !/^[A-Z0-9_]+$/.test(app.keyIndexVariable) || !/^[\w.]+\/\.env$/.test(app.file)) fail('Invalid environment policy entry');
    if (paths.has(app.file) || secrets.has(app.secret) || indexes.has(app.keyIndexVariable)) fail('Duplicate environment policy path/secret/index');
    paths.add(app.file); secrets.add(app.secret); indexes.add(app.keyIndexVariable);
  }
}
requireSafePolicy();

function argsFrom(argv) {
  const args = { apply: false, allowRemovals: false, force: false, app: 'all', scope: 'all', restoreCi: false, cleanupCi: false, help: false, allowProductionValues: false, selfTest: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo' || a === '--app' || a === '--scope' || a === '--root') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) fail(`Missing value for ${a}`);
      args[{ '--repo': 'repo', '--app': 'app', '--scope': 'scope', '--root': 'root' }[a]] = argv[++i];
    } else if (a === '--apply') args.apply = true;
    else if (a === '--allow-removals') args.allowRemovals = true;
    else if (a === '--force') args.force = true;
    else if (a === '--allow-production-values') args.allowProductionValues = true;
    else if (a === '--self-test') args.selfTest = true;
    else if (a === '--restore-ci') args.restoreCi = true;
    else if (a === '--cleanup-ci') args.cleanupCi = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else fail(`Unknown argument: ${a}`);
  }
  if (args.restoreCi && args.cleanupCi) fail('Only one runner mode may be selected');
  if ((args.restoreCi || args.cleanupCi) && (args.apply || args.repo || args.allowRemovals)) fail('Runner operations cannot synchronize GitHub');
  if (!args.restoreCi && !args.cleanupCi && !args.help && !args.selfTest && (!args.repo || !REPO_RE.test(args.repo))) fail('Supply --repo OWNER/REPO');
  if (!['all', ...APP_IDS].includes(args.app)) fail(`Unknown --app: ${args.app}`);
  if (args.restoreCi && !Object.hasOwn(POLICY.ciScopeApplications, args.scope)) fail(`Unknown --scope: ${args.scope}`);
  return args;
}

/** Only derive identifiers and fingerprints, never print parsed secret values. */
function dotenvKeys(text, file) {
  const result = new Map();
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const m = line.match(/^\s*(?:export\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) fail(`Malformed .env assignment at ${file}:${i + 1} (value withheld)`);
    const name = m[1];
    if (result.has(name)) fail(`Duplicate variable ${name} at ${file}:${i + 1}`);
    let raw = m[2];
    const quote = raw[0];
    if (quote === '"' || quote === "'" || quote === '`') {
      let remaining = raw.slice(1);
      let closed = false;
      while (!closed) {
        for (let j = 0; j < remaining.length; j++) {
          if (remaining[j] === quote && (j === 0 || remaining[j - 1] !== '\\')) { closed = true; break; }
        }
        if (closed) break;
        i += 1;
        if (i >= lines.length) fail(`Unclosed quoted .env value ${name} in ${file}`);
        raw += `\n${lines[i]}`;
        remaining = lines[i];
      }
    }
    result.set(name, raw);
  }
  if (result.size === 0) fail(`No environment variables found in ${file}`);
  return result;
}

function localKey(create) {
  if (!existsSync(KEY_FILE)) {
    if (!create) return null;
    mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(KEY_FILE, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  }
  return readFileSync(KEY_FILE, 'utf8').trim();
}
function fingerprint(value, key) {
  return createHmac('sha256', key).update(value).digest('hex');
}
function loadState() {
  if (!existsSync(STATE_FILE)) return { version: 1, targets: {} };
  const data = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  if (data.version !== 1 || !data.targets || typeof data.targets !== 'object') fail('Unrecognized local synchronization state');
  return data;
}
function writeState(data) {
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  const temp = `${STATE_FILE}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  renameSync(temp, STATE_FILE);
  chmodSync(STATE_FILE, 0o600);
}

function gh(args, input = undefined) {
  return new Promise((ok, bad) => {
    const proc = spawn('gh', args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = ''; let stderr = '';
    proc.stdout.setEncoding('utf8'); proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', (s) => { stdout += s; });
    proc.stderr.on('data', (s) => { stderr += s; });
    proc.on('error', () => bad(new Error('Cannot execute GitHub CLI. Install gh and run gh auth login.')));
    proc.on('close', (code) => {
      if (code === 0) ok(stdout);
      else bad(new Error(`GitHub CLI command failed (${code}); check authentication, repository permissions and connectivity. (diagnostics withheld because provider stderr may contain secrets)`));
    });
    proc.stdin.on('error', () => {});
    proc.stdin.end(input);
  });
}
function validateProductionRisk(map, app, allow) {
  if (allow) return;
  const v = ['NODE_ENV', 'UI_ENVIRONMENT'].map((n) => (map.get(n) || '').toLowerCase());
  if (v.some((n) => /\bproduction\b/.test(n))) fail(`${app.file} declares production runtime values; refusing GitHub CI upload without --allow-production-values`);
  for (const name of ['API_BASE_URL', 'UI_PUBLIC_BASE_URL', 'PUBLIC_BASE_URL']) {
    if (/manatos\.info/i.test(map.get(name) || '')) fail(`${app.file} may reference production endpoints; refusing upload without --allow-production-values`);
  }
}

async function sync(args) {
  const apps = args.app === 'all' ? POLICY.applications : POLICY.applications.filter((app) => app.id === args.app);
  const state = loadState();
  const old = state.targets[args.repo] || {};
  const key = localKey(args.apply);
  const remoteNames = new Set(JSON.parse(await gh(['secret', 'list', '--repo', args.repo, '--json', 'name'])).map((obj) => obj.name));
  const remoteIndex = new Map(JSON.parse(await gh(['variable', 'list', '--repo', args.repo, '--json', 'name,value'])).map((obj) => [obj.name, obj.value]));
  const changes = [];
  for (const app of apps) {
    const file = join(PROJECT_ROOT, app.file);
    if (!existsSync(file)) fail(`Missing ${app.file}; sync reads actual local .env files ONLY (never .env.example)`);
    if (lstatSync(file).isSymbolicLink() || !statSync(file).isFile()) fail(`Expected a regular local file: ${app.file}`);
    const bytes = readFileSync(file);
    if (bytes.length > SECRET_MAX_BYTES) fail(`${app.file} exceeds GitHub Actions' 48-KiB secret size limit`);
    if (bytes.includes(0)) fail(`${app.file} contains NUL bytes`);
    const content = bytes.toString('utf8');
    if (!Buffer.from(content).equals(bytes)) fail(`${app.file} must be UTF-8`);
    const variables = dotenvKeys(content, app.file);
    validateProductionRisk(variables, app, args.allowProductionValues);
    const previous = old[app.id];
    let previousNames = previous ? Object.keys(previous.keys || {}) : [];
    // Recover deletion safety across computers or when local sync state is missing.
    const remoteNamesJson = remoteIndex.get(app.keyIndexVariable);
    if (remoteNamesJson) {
      let names;
      try { names = JSON.parse(remoteNamesJson); } catch { fail(`Invalid GitHub key index ${app.keyIndexVariable}`); }
      if (!Array.isArray(names) || names.some((n) => typeof n !== 'string')) fail(`Invalid GitHub key index ${app.keyIndexVariable}`);
      previousNames = [...new Set([...previousNames, ...names])];
    }
    const removed = previousNames.filter((k) => !variables.has(k)).sort();
    const added = [...variables.keys()].filter((k) => !previousNames.includes(k)).sort();
    const updated = previous && key ? [...variables.entries()].filter(([k, v]) => previous.keys?.[k] && previous.keys[k] !== fingerprint(v, key)).map(([k]) => k).sort() : [];
    const digest = key ? fingerprint(content, key) : null;
    const missingRemote = !remoteNames.has(app.secret);
    const keyIndexChanged = !remoteNamesJson || JSON.stringify([...variables.keys()].sort()) !== JSON.stringify([...new Set(previousNames)].sort());
    const changed = args.force || missingRemote || !previous || !digest || previous.digest !== digest || keyIndexChanged;
    changes.push({ app, content, variables, removed, added, updated, changed, missingRemote, digest, keyIndexChanged });
  }
  console.log(`GitHub target: ${args.repo} (repository Actions secrets)`);
  console.log(`Source: LOCAL .env files under ${PROJECT_ROOT}`);
  for (const c of changes) {
    const status = c.changed ? (c.missingRemote ? 'CREATE' : 'UPDATE') : 'UNCHANGED (local sync state)';
    console.log(`${c.app.id}: ${status} ${c.app.secret}; ${c.variables.size} keys`);
    for (const [label, names] of [['add', c.added], ['change', c.updated], ['remove', c.removed]]) if (names.length) console.log(`  ${label}: ${names.join(', ')}`);
    if (!c.changed && !c.missingRemote) console.log('  Note: GitHub does not expose secret values; external edits cannot be detected. Use --force to refresh.');
    if (!c.digest && !args.apply) console.log('  First preview without local signing key: value comparisons unavailable until first apply.');
  }
  if (!args.apply) { console.log('PREVIEW ONLY: no GitHub settings changed. Add --apply to synchronize.'); return; }
  if (changes.some((c) => c.removed.length) && !args.allowRemovals) fail('Variable removals detected. Review preview, then use --apply --allow-removals to confirm.');
  // Safety: do not write an .env file to the repository or emit any values to logs.
  for (const c of changes) {
    if (!c.changed) continue;
    await gh(['secret', 'set', c.app.secret, '--repo', args.repo], c.content);
    // This index exposes ONLY variable names (not values) for safe deletion detection.
    await gh(['variable', 'set', c.app.keyIndexVariable, '--repo', args.repo], JSON.stringify([...c.variables.keys()].sort()));
    old[c.app.id] = {
      digest: c.digest,
      keys: Object.fromEntries([...c.variables.entries()].map(([k, v]) => [k, fingerprint(v, key)])),
      keyNames: [...c.variables.keys()].sort(),
      synchronizedAt: new Date().toISOString(),
    };
    state.targets[args.repo] = old;
    writeState(state);
    console.log(`${c.app.id}: GitHub Actions secret synchronized successfully`);
  }
  console.log('Synchronization complete. The local state contains keyed fingerprints, not .env values.');
}

/** GitHub masks the whole bundle secret, not necessarily each individual value. */
function parsedMaskValue(raw) {
  const trimmed = raw.trim();
  const quote = trimmed[0];
  if (quote === '"' || quote === "'" || quote === '`') {
    let escaped = false;
    for (let i = 1; i < trimmed.length; i++) {
      if (trimmed[i] === quote && !escaped) {
        const body = trimmed.slice(1, i);
        return quote === '"' ? body.replace(/\\n/g, '\n').replace(/\\r/g, '\r') : body;
      }
      if (trimmed[i] === '\\' && !escaped) escaped = true;
      else escaped = false;
    }
  }
  return trimmed.replace(/\s+#.*$/, '').trim();
}
function sensitiveValues(variableMap) {
  const values = new Set();
  for (const [key, raw] of variableMap) {
    const value = parsedMaskValue(raw);
    if (value.length < 3) continue;
    if (/SECRET|KEY|TOKEN|PASSWORD|CREDENTIAL|AUTH|ENCRYPTION|SMTP_USER|BOOTSTRAP_ADMIN_EMAIL/i.test(key) ||
        (value.length >= 8 && !/^(?:localhost|https?:\/\/localhost(?::\d+)?|true|false)$/i.test(value))) {
      values.add(value);
    }
  }
  return values;
}
function maskSensitiveValues(values) {
  for (const value of values) {
    const commandPayload = value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    process.stdout.write(`::add-mask::${commandPayload}\n`);
  }
}

function tempMarker() {
  const root = process.env.RUNNER_TEMP || tmpdir();
  return resolve(root, `manatos-ci-env-files-${process.env.GITHUB_RUN_ID || 'local'}.json`);
}
function runnerRestore(args) {
  if (process.env.GITHUB_ACTIONS !== 'true' || !process.env.RUNNER_TEMP) fail('--restore-ci requires a GitHub Actions runner');
  const ids = POLICY.ciScopeApplications[args.scope];
  const created = [];
  const valuesForRedaction = new Set();
  const root = args.root ? resolve(args.root) : process.cwd();
  const marker = tempMarker();
  if (existsSync(marker)) fail('Runner .env files already materialized; refusing to overwrite');
  // Validate all requirements before writing anything.
  const snapshots = [];
  for (const app of POLICY.applications.filter((item) => ids.includes(item.id))) {
    const text = process.env[app.secret];
    if (!text) fail(`Missing GitHub Actions secret ${app.secret}. Synchronize local ${app.file} with env-sync.mjs.`);
    const vars = dotenvKeys(text, app.file);
    const sensitive = sensitiveValues(vars);
    for (const value of sensitive) {
      valuesForRedaction.add(value);
      if (value.includes('\n')) for (const segment of value.split('\n')) if (segment.length >= 4) valuesForRedaction.add(segment);
    }
    maskSensitiveValues(sensitive);
    const path = resolve(root, app.file);
    if (!path.startsWith(`${root}${sep}`)) fail('Invalid output path');
    if (existsSync(path)) fail(`Refusing to overwrite ${app.file}; check repository for accidentally committed .env`);
    snapshots.push({ path, file: app.file, text });
  }
  try {
    const redactionFile = resolve(process.env.RUNNER_TEMP, `manatos-ci-redactions-${process.env.GITHUB_RUN_ID || 'local'}.json`);
    if (existsSync(redactionFile)) fail('Runner redaction file already exists');
    writeFileSync(redactionFile, JSON.stringify([...valuesForRedaction]), { mode: 0o600, flag: 'wx' });
    for (const entry of snapshots) {
      if (!existsSync(dirname(entry.path))) fail(`Missing expected application directory: ${dirname(entry.path)}`);
      writeFileSync(entry.path, entry.text, { mode: 0o600, flag: 'wx' });
      created.push(entry.path);
      writeFileSync(marker, JSON.stringify({ root, created }), { mode: 0o600 });
      console.log(`CI configuration prepared: ${entry.file} (values hidden)`);
    }
  } catch (e) {
    for (const path of created) rmSync(path, { force: true });
    rmSync(resolve(process.env.RUNNER_TEMP, `manatos-ci-redactions-${process.env.GITHUB_RUN_ID || 'local'}.json`), { force: true });
    rmSync(marker, { force: true });
    throw e;
  }
}
function runnerCleanup(args) {
  if (process.env.GITHUB_ACTIONS !== 'true' || !process.env.RUNNER_TEMP) fail('--cleanup-ci requires a GitHub Actions runner');
  const marker = tempMarker();
  if (!existsSync(marker)) { console.log('No managed .env files to clean up.'); return; }
  const data = JSON.parse(readFileSync(marker, 'utf8'));
  const root = args.root ? resolve(args.root) : process.cwd();
  const allowed = new Set(POLICY.applications.map((app) => resolve(root, app.file)));
  for (const path of data.created || []) {
    if (!allowed.has(path) || !path.startsWith(`${root}${sep}`)) fail('Refusing to remove unexpected file path');
    rmSync(path, { force: true });
  }
  rmSync(marker, { force: true });
  rmSync(resolve(process.env.RUNNER_TEMP, `manatos-ci-redactions-${process.env.GITHUB_RUN_ID || 'local'}.json`), { force: true });
  console.log('Temporary CI .env files and log-redaction data removed.');
}

async function main() {
  const args = argsFrom(process.argv.slice(2));
  if (args.help) {
    console.log('Preview: node devops/scripts/env-sync.mjs --repo OWNER/REPO [--app api|ejs0|ejs1|ng1]');
    console.log('Apply:   node devops/scripts/env-sync.mjs --repo OWNER/REPO --apply [--allow-removals] [--force]');
    console.log('Source:  local api/.env, ui.EJS0/.env, ui.EJS1/.env, ui.NG1/.env; no .env.example');
    console.log('Production-looking settings require --allow-production-values (strongly discouraged for CI).');
    return;
  }
  if (args.selfTest) {
    const cases = [
      ['PLAIN=foo\n# comment\nSPACE = bar\n', ['PLAIN', 'SPACE']],
      ['MULTILINE="line1\nline2"\nexport OTHER=x\n', ['MULTILINE', 'OTHER']],
      ["QUOTED='value with # comment'\nURL=http://localhost/#frag\n", ['QUOTED', 'URL']],
    ];
    for (const [raw, expected] of cases) {
      const actual = [...dotenvKeys(raw, 'selftest.env').keys()];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('Self-test failed: dotenv variable detection');
    }
    for (const invalid of ['A=x\nA=y\n', 'BAD LINE\n', 'A="unterminated\n']) {
      let rejected = false;
      try { dotenvKeys(invalid, 'invalid.env'); } catch { rejected = true; }
      if (!rejected) fail('Self-test failed: malformed input accepted');
    }
    console.log('Environment sync self-test passed (source parsing, duplicates, malformed input).');
    return;
  }
  if (args.restoreCi) runnerRestore(args);
  else if (args.cleanupCi) runnerCleanup(args);
  else await sync(args);
}
main().catch((error) => { console.error(`Environment sync failed: ${error.message}`); process.exitCode = 1; });
