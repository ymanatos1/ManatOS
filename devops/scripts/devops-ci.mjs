/**
 * GitHub CI adapter for ManatOS. Runs existing lint/build/test package scripts;
 * deliberately excludes formatting checks. `verify-run` starts development servers,
 * and `verify` includes Prettier, so neither is suitable for this CI policy.
 * Phase 1 never creates deployable artifacts.
 */
import { spawn } from 'node:child_process';
import { appendFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { stripVTControlCharacters } from 'node:util';

const WORKSPACE_ORDER = Object.freeze([
  'shared',
  'shared.UI',
  'shared.UI.NG',
  'shared.UI.EJS',
  'api',
  'ui.NG1',
  'ui.EJS1',
]);
const WORKSPACES = Object.freeze({
  all: WORKSPACE_ORDER,
  api: ['shared', 'api'],
  uis: [
    'shared',
    'shared.UI',
    'shared.UI.NG',
    'shared.UI.EJS',
    'ui.NG1',
    'ui.EJS1',
  ],
  ng1: ['shared', 'shared.UI', 'shared.UI.NG', 'ui.NG1'],
  ejs1: ['shared', 'shared.UI', 'shared.UI.EJS', 'ui.EJS1'],
});
const OPERATIONS = Object.freeze(['verify', 'quality', 'lint', 'build', 'test']);
const args = process.argv.slice(2);

function getOption(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) {
    throw new Error(`Missing value for --${name}`);
  }
  return args[index + 1];
}

function assertAllowed(name, value, values) {
  if (!values.includes(value)) {
    throw new Error(`Unsupported ${name} '${value}'. Allowed: ${values.join(', ')}`);
  }
}

function createPlan(scope, operation) {
  assertAllowed('scope', scope, Object.keys(WORKSPACES));
  assertAllowed('operation', operation, OPERATIONS);
  const workspaces = WORKSPACES[scope];
  // Lint only the intended production workspaces, never the legacy EJS0 project.
  const quality = [
    { label: 'ESLint', command: ['npm', 'exec', '--', 'eslint', ...workspaces] },
  ];
  const builds = workspaces.map((name) => ({
    label: `Build ${name}`,
    command: ['npm', 'run', 'build', '--workspace', name],
  }));
  // Canonical verifier uses api tests first, followed by the shared/test workspace order.
  const tests = [
    'api',
    'shared',
    'shared.UI',
    'shared.UI.NG',
    'shared.UI.EJS',
    'ui.NG1',
    'ui.EJS1',
  ]
    .filter((name) => workspaces.includes(name))
    .map((name) => ({
      label: `Test ${name}`,
      command: ['npm', 'run', 'test', '--workspace', name],
    }));

  if (operation === 'quality' || operation === 'lint') return quality;
  if (operation === 'build') {
    return builds;
  }
  if (operation === 'test') {
    return [...builds, ...tests];
  }
  // Never call the root build/test graphs: those still include legacy EJS0.
  // Also avoid `verify` (Prettier) and `verify-run` (long-lived servers).
  return [...quality, ...builds, ...tests];
}

/** Check that the future repository is complete; never silently fall back to old layouts. */
function preflight(scope, root) {
  assertAllowed('scope', scope, Object.keys(WORKSPACES));
  const manifestPath = resolve(root, 'package.json');
  const lockPath = resolve(root, 'package-lock.json');
  const nodePath = resolve(root, '.nvmrc');
  for (const path of [manifestPath, lockPath, nodePath]) {
    if (!existsSync(path)) throw new Error(`Missing required CI source file: ${path}`);
  }
  const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const entries = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages;
  if (!Array.isArray(entries)) throw new Error('Invalid npm workspace declaration');
  const required = WORKSPACES[scope];
  for (const workspace of required) {
    if (!entries.includes(workspace)) throw new Error(`Missing npm workspace declaration: ${workspace}`);
    const path = resolve(root, workspace, 'package.json');
    if (!existsSync(path)) throw new Error(`Missing required production workspace: ${workspace}`);
    const content = JSON.parse(readFileSync(path, 'utf8'));
    for (const operation of ['build', 'test']) {
      if (typeof content.scripts?.[operation] !== 'string' || !content.scripts[operation]) {
        throw new Error(`Missing ${operation} script in production workspace: ${workspace}`);
      }
    }
  }
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  if (!Number.isInteger(lock.lockfileVersion) || lock.lockfileVersion < 2) {
    throw new Error('Unsupported npm lockfile format');
  }
  console.log(`Production workspace preflight PASS: ${scope} (${required.join(', ')})`);
}

function escapeMarkdown(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('`', '\\`').replaceAll('\r', ' ');
}

function annotateError(title, message) {
  if (!process.env.GITHUB_ACTIONS) return;
  const safe = (value) =>
    String(value)
      .replaceAll('%', '%25')
      .replaceAll('\r', '%0D')
      .replaceAll('\n', '%0A')
      .slice(0, 300);
  console.log(`::error title=${safe(title)}::${safe(message)}`);
}

/** Redact stdout/stderr BEFORE writing logs, job summaries, or artifact files.
 * GitHub's masking protects its UI, not raw files captured by a subprocess.
 * Retain enough unflushed characters to catch secrets split across chunks.
 */
class LogRedactor {
  constructor(values = []) {
    this.values = [...new Set(values.filter((v) => typeof v === 'string' && v.length > 0))]
      .sort((a, b) => b.length - a.length);
    this.maxLength = this.values.reduce((n, v) => Math.max(n, v.length), 0);
    this.buffer = '';
  }
  process(chunk, flush = false) {
    this.buffer += chunk;
    if (!this.maxLength) {
      const output = this.buffer;
      this.buffer = '';
      return output;
    }
    const cutoff = flush ? this.buffer.length : Math.max(0, this.buffer.length - this.maxLength + 1);
    if (!cutoff) return '';
    let cursor = 0;
    let output = '';
    while (cursor < cutoff) {
      let matchedAt = Number.POSITIVE_INFINITY;
      let matchedValue = null;
      for (const value of this.values) {
        const index = this.buffer.indexOf(value, cursor);
        if (index !== -1 && (index < matchedAt || (index === matchedAt && value.length > matchedValue.length))) {
          matchedAt = index;
          matchedValue = value;
        }
      }
      if (!matchedValue || matchedAt >= cutoff) {
        output += this.buffer.slice(cursor, cutoff);
        cursor = cutoff;
      } else {
        output += this.buffer.slice(cursor, matchedAt) + '[REDACTED]';
        cursor = matchedAt + matchedValue.length;
      }
    }
    this.buffer = this.buffer.slice(cursor);
    return output;
  }
}
function getArtifactRedactions() {
  if (!process.env.MANATOS_CI_REDACTIONS_FILE && (!process.env.GITHUB_ACTIONS || !process.env.RUNNER_TEMP)) return [];
  const path = process.env.MANATOS_CI_REDACTIONS_FILE ||
    join(process.env.RUNNER_TEMP, `manatos-ci-redactions-${process.env.GITHUB_RUN_ID || 'local'}.json`);
  if (!existsSync(path)) {
    if (process.env.MANATOS_CI_REDACTIONS_FILE) throw new Error('Local redaction file is missing');
    return [];
  }
  const values = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(values) || values.some((v) => typeof v !== 'string')) {
    throw new Error('Invalid private CI log-redaction data');
  }
  return values;
}
function redactorSelfTest() {
  const redactor = new LogRedactor(['INTERNAL-TEST-KEY', 'ABCD-1234']);
  const output = redactor.process('prefix INTERNAL-TE') +
    redactor.process('ST-KEY other ABC') +
    redactor.process('D-1234 end') + redactor.process('', true);
  if (output !== 'prefix [REDACTED] other [REDACTED] end') {
    throw new Error('Streaming log-redaction self-test failed');
  }
  console.log('Log-redaction self-test passed (split chunks, multiple values).');
}

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function summarize(result) {
  const rows = result.steps.map(
    (step) =>
      `| ${escapeMarkdown(step.label)} | ${step.status} | ${formatDuration(step.durationMs)} |`,
  );
  const failure = result.steps.find((step) => step.status === 'FAILED');
  const summary = [
    `## ManatOS CI — ${result.status}`,
    '',
    `- **Scope:** ${result.scope}`,
    `- **Operation:** ${result.operation}`,
    `- **${result.sourceIdentityKind === 'source-snapshot-only' ? 'Local snapshot ID (not Git commit)' : 'Application commit'}:** ${result.sha}`,
    `- **DevOps commit:** \`${result.devopsSha}\``,
    `- **Triggered by:** ${escapeMarkdown(result.actor)} (${escapeMarkdown(result.event)})`,
    `- **Duration:** ${formatDuration(result.durationMs)}`,
    ...(result.sourceFingerprint ? [`- **Local source fingerprint:** \`${result.sourceFingerprint}\` (dirty: ${result.localSourceDirty})`] : []),
    '- **CI formatting checks:** DISABLED (Prettier is not executed)',
    '- **Release eligibility:** NOT GRANTED (Phase 1 builds no production release artifact)',
    '',
    '| Operation | Result | Duration |',
    '|---|---|---:|',
    ...rows,
  ];
  if (failure) {
    summary.push(
      '',
      `### First failure: ${escapeMarkdown(failure.label)}`,
      `Command: \`${escapeMarkdown(failure.command.join(' '))}\``,
      `Exit: ${escapeMarkdown(failure.reason)}`,
      '',
      'Last captured output (full diagnostics are in the downloadable artifact):',
      '```text',
      ...(failure.tail || []).map((line) => line.slice(0, 300)),
      '```',
    );
  }
  return `${summary.join('\n')}\n`;
}

async function runStep(step, index, directory, sensitiveValues) {
  const started = Date.now();
  const logfile = join(directory, `step-${String(index + 1).padStart(2, '0')}.log`);
  const log = createWriteStream(logfile, { flags: 'w' });
  const tail = [];
  let pending = '';
  let reason = 'Exit code unavailable';
  const capture = (stream, destination) => {
    const redactor = new LogRedactor(sensitiveValues);
    const decoder = new StringDecoder('utf8');
    const output = (chunk) => {
      if (!chunk) return;
      destination.write(chunk);
      log.write(chunk);
      pending += stripVTControlCharacters(chunk);
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || '';
      for (const line of lines) {
        tail.push(line);
        if (tail.length > 20) tail.shift();
      }
    };
    stream.on('data', (buffer) => { output(redactor.process(decoder.write(buffer))); });
    stream.on('end', () => { output(redactor.process(decoder.end(), true)); });
  };
  console.log(`\n=== ${step.label} ===`);
  const [program, ...arguments_] = step.command;
  const exitCode = await new Promise((done) => {
    // Windows npm is npm.cmd; shell resolution works from ordinary CMD.
    // Commands are strictly constructed from fixed, allowlisted CI operations.
    const child = spawn(program, arguments_, { stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32', windowsHide: true });
    child.on('error', (error) => {
      reason = error.message;
    });
    capture(child.stdout, process.stdout);
    capture(child.stderr, process.stderr);
    child.on('close', (code, signal) => {
      if (code !== null) reason = `Exit code ${code}`;
      else if (signal) reason = `Terminated by signal ${signal}`;
      done(code === 0 ? 0 : 1);
    });
  });
  if (pending) tail.push(pending);
  await new Promise((done) => log.end(done));
  const status = exitCode === 0 ? 'PASSED' : 'FAILED';
  console.log(`${step.label}: ${status} (${formatDuration(Date.now() - started)})`);
  if (exitCode !== 0) {
    annotateError(`ManatOS ${step.label} failed`, reason);
  }
  return { ...step, status, reason, durationMs: Date.now() - started, logfile, tail };
}

if (args.includes('--redactor-self-test')) {
  redactorSelfTest();
  process.exit(0);
}

const scope = getOption('scope', 'all');
const operation = getOption('operation', 'verify');
if (args.includes('--preflight')) {
  preflight(scope, resolve(getOption('root', '.')));
  process.exit(0);
}
const plan = createPlan(scope, operation);
if (args.includes('--plan')) {
  console.log(JSON.stringify({ scope, operation, steps: plan }, null, 2));
  process.exit(0);
}

const directory = resolve(
  process.env.MANATOS_CI_REPORT_DIR || join(tmpdir(), 'manatos-ci-reports'),
);
mkdirSync(directory, { recursive: true });
const started = Date.now();
const sensitiveValues = getArtifactRedactions();
const completed = [];
let passed = true;
for (let i = 0; i < plan.length; i += 1) {
  const step = plan[i];
  if (!passed) {
    completed.push({
      ...step,
      status: 'NOT RUN',
      reason: 'Previous operation failed',
      durationMs: 0,
    });
    continue;
  }
  const result = await runStep(step, i, directory, sensitiveValues);
  completed.push(result);
  if (result.status !== 'PASSED') passed = false;
}
const result = {
  schemaVersion: 1,
  scope,
  operation,
  sha: process.env.MANATOS_SOURCE_SHA || 'local',
  sourceFingerprint: process.env.MANATOS_LOCAL_SOURCE_FINGERPRINT || null,
  localSourceDirty: process.env.MANATOS_LOCAL_SOURCE_DIRTY === 'true',
  sourceIdentityKind: process.env.MANATOS_LOCAL_SOURCE_IDENTITY_KIND || 'github-commit',
  devopsSha: process.env.GITHUB_SHA || 'local',
  sourceRepository: process.env.MANATOS_SOURCE_REPOSITORY || 'unspecified',
  actor: process.env.GITHUB_ACTOR || 'local',
  event: process.env.GITHUB_EVENT_NAME || 'local',
  nodeVersion: process.version,
  runId: process.env.GITHUB_RUN_ID || null,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  status: passed ? 'PASSED' : 'FAILED',
  durationMs: Date.now() - started,
  releaseEligible: false,
  steps: completed.map(({ tail, ...step }) => ({ ...step, tail: tail || [] })),
};
writeFileSync(join(directory, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
const summary = summarize(result);
writeFileSync(join(directory, 'summary.md'), summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}
console.log(`\nManatOS CI ${result.status}. Reports: ${directory}`);
process.exitCode = passed ? 0 : 1;
