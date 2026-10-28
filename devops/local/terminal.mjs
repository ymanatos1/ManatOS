/**
 * Presentation-only CLI output adapter shared by all local DevOps commands.
 * ANSI colors are emitted only for interactive terminals; CMD/VS Code supported.
 * No new dependencies, shell commands, or changes to underlying CI/CD evidence.
 */
import assert from 'node:assert/strict';
import { StringDecoder } from 'node:string_decoder';

const RESET = '\x1b[0m';
const ANSI = Object.freeze({
  green: '\x1b[1;32m', red: '\x1b[1;31m', yellow: '\x1b[1;33m',
  cyan: '\x1b[1;36m', blue: '\x1b[1;34m', dim: '\x1b[2m',
});

// Strip escape sequences supplied by child processes before we apply our own.
// This also prevents ANSI styling from contaminating redirected output.
const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const CSI = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const SIMPLE_ESC = /\x1b[@-_]/g;
function stripAnsi(value) {
  return String(value).replace(OSC, '').replace(CSI, '').replace(SIMPLE_ESC, '');
}

export function colorsEnabled(env = process.env, isTTY = process.stdout.isTTY) {
  // NO_COLOR follows the widely adopted no-color convention. Never emit ANSI
  // when stdout is redirected, regardless of FORCE_COLOR or other settings.
  return isTTY === true && !Object.hasOwn(env, 'NO_COLOR') && env.TERM !== 'dumb';
}

const LABELS = /\b(NON-DEPLOYABLE|NOT DEPLOYABLE|NOT RUN|DISABLED|SKIPPED|REFUSED|REJECTED|FAILED|FAILURE|FAIL|ERROR|EPERM|EACCES|WARNING|WARN|PASSED|PASS|SUCCESS)\b/gi;
function codeFor(label) {
  if (/^(?:PASS|PASSED|SUCCESS)$/i.test(label)) return ANSI.green;
  if (/^(?:WARNING|WARN|NOT RUN|DISABLED|SKIPPED|NON-DEPLOYABLE|NOT DEPLOYABLE)$/i.test(label)) return ANSI.yellow;
  return ANSI.red;
}
export function styleLine(value, enabled = colorsEnabled()) {
  const line = stripAnsi(value);
  if (!enabled || !line) return line;
  if (/^\s*>>\s/.test(line)) return ANSI.cyan + line + RESET;
  if (/^\s*<<\s/.test(line)) {
    const state = /:\s*(PASS|FAIL)\b/i.exec(line)?.[1];
    return (state === undefined ? ANSI.blue : codeFor(state)) + line + RESET;
  }
  if (/^(?:Local DevOps ERROR|Error:|npm (?:ERR!|error)|Fatal:)/i.test(line)) return ANSI.red + line + RESET;
  return line.replace(LABELS, (match) => codeFor(match) + match + RESET);
}

/** Write UTF-8 child output as it arrives, preserving line breaks and flushing
 * trailing partial lines on close. Bounds buffering for tools without newlines.
 */
export function createLineRenderer(output, enabled = colorsEnabled(process.env, output.isTTY)) {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  const emit = (part) => output.write(styleLine(part, enabled));
  function drain(final = false) {
    let match;
    while ((match = /\r\n|\n|\r/.exec(pending)) !== null) {
      const end = match.index + match[0].length;
      emit(pending.slice(0, end));
      pending = pending.slice(end);
    }
    // A process can emit a very long line or progress stream; don't buffer it
    // indefinitely or hide progress while waiting for a newline.
    while (pending.length > 16384) {
      emit(pending.slice(0, 8192));
      pending = pending.slice(8192);
    }
    if (final && pending) { emit(pending); pending = ''; }
  }
  return {
    write(chunk) { pending += decoder.write(chunk); drain(); },
    end() { pending += decoder.end(); drain(true); },
  };
}

export function printLine(message, stream = process.stdout) {
  stream.write(styleLine(String(message), colorsEnabled(process.env, stream.isTTY)) + '\n');
}

export function terminalSelfTest() {
  assert.equal(colorsEnabled({}, false), false);
  assert.equal(colorsEnabled({ NO_COLOR: '1' }, true), false);
  assert.equal(colorsEnabled({ NO_COLOR: '' }, true), false);
  assert.equal(colorsEnabled({ TERM: 'dumb' }, true), false);
  assert.equal(colorsEnabled({}, true), true);
  assert.equal(colorsEnabled({ FORCE_COLOR: '3' }, false), false);
  assert.equal(styleLine('<< check: PASS (0.1s)', true).includes(ANSI.green), true);
  assert.equal(styleLine('<< check: FAIL (0.1s)', true).includes(ANSI.red), true);
  assert.equal(styleLine('WARNING: NON-DEPLOYABLE', true).includes(ANSI.yellow), true);
  assert.equal(styleLine('>> run engine', true).includes(ANSI.cyan), true);
  assert.equal(styleLine('PASS: ok', false), 'PASS: ok');
  assert.equal(styleLine('\x1b[31mPASS\x1b[0m', false), 'PASS');
  for (const enabled of [false, true]) {
    const writes = [];
    const stream = { write: (str) => { writes.push(str); return true; } };
    const renderer = createLineRenderer(stream, enabled);
    const source = Buffer.from('>> check\r\nPASS: καλώς ✓\nFAIL: no newline');
    for (let i = 0; i < source.length; i += 3) renderer.write(source.subarray(i, i + 3));
    renderer.end();
    const result = writes.join('');
    assert.equal(stripAnsi(result), source.toString());
    assert.equal(result.includes('\x1b['), enabled);
  }
  printLine('Terminal colors self-test PASS (TTY, NO_COLOR, redirected output, UTF-8 streaming).');
}
