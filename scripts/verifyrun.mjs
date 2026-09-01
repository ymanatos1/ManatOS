import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { resolve } from 'node:path';

const isWindows = process.platform === 'win32';
const command = isWindows ? process.env.ComSpec || 'cmd.exe' : 'npm';
const logPath = resolve(process.cwd(), 'verifyrun.log');
const logStream = createWriteStream(logPath, { flags: 'w', encoding: 'utf8' });

const ANSI = {
  green: '\x1b[32m',
  boldGreen: '\x1b[1;32m',
  reset: '\x1b[0m',
};

function npmArgs(...args) {
  return isWindows ? ['/d', '/s', '/c', `npm ${args.join(' ')}`] : args;
}

/** Keep verifyrun.log readable even when child processes emit ANSI colours. */
function stripAnsi(value) {
  return String(value).replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/** Write a verifyrun-owned line to both console and the current-run log. */
function printLine(value = '', color = '') {
  const text = String(value);
  process.stdout.write(`${color}${text}${color ? ANSI.reset : ''}\n`);
  logStream.write(`${stripAnsi(text)}\n`);
}

/**
 * The development runner prefixes workspace output (for example `[2]`).
 * Colour only confirmed healthy startup/watch lines; ordinary restart chatter
 * remains neutral and warnings/errors keep the colour chosen by their source.
 */
function healthyRuntimeLine(line) {
  const plain = stripAnsi(line);
  return /\bManatOS UI:\s*http:\/\//.test(plain)
    || /\bAPI:\s*http:\/\//.test(plain)
    || /Found 0 errors\. Watching for file changes\./.test(plain);
}

/**
 * Pipe one child stream to the terminal and log without losing partial lines.
 * The log always receives plain text; optional runtime colour is console-only.
 */
function pipeStream(stream, target, { greenHealthy = false } = {}) {
  let pending = '';

  stream.on('data', (chunk) => {
    const text = chunk.toString();
    logStream.write(stripAnsi(text));
    pending += text;

    let newlineIndex = pending.indexOf('\n');
    while (newlineIndex >= 0) {
      let line = pending.slice(0, newlineIndex);
      pending = pending.slice(newlineIndex + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);

      if (greenHealthy && healthyRuntimeLine(line)) {
        target.write(`${ANSI.green}${line}${ANSI.reset}\n`);
      } else {
        target.write(`${line}\n`);
      }

      newlineIndex = pending.indexOf('\n');
    }
  });

  return () => {
    if (!pending) return;
    if (greenHealthy && healthyRuntimeLine(pending)) {
      target.write(`${ANSI.green}${pending}${ANSI.reset}`);
    } else {
      target.write(pending);
    }
    pending = '';
  };
}

/**
 * Run an npm command while teeing stdout/stderr into verifyrun.log.
 * `greenHealthy` is enabled only after the verification gate has succeeded.
 */
function runNpm(args, { greenHealthy = false } = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, npmArgs(...args), {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: process.env,
    });

    const flushStdout = pipeStream(child.stdout, process.stdout, { greenHealthy });
    const flushStderr = pipeStream(child.stderr, process.stderr);

    child.on('error', (error) => {
      const message = `Failed to execute npm ${args.join(' ')}: ${error.message}`;
      process.stderr.write(`${message}\n`);
      logStream.write(`${message}\n`);
      resolveRun(1);
    });

    child.on('close', (code) => {
      flushStdout();
      flushStderr();
      resolveRun(code ?? 1);
    });
  });
}

printLine();
printLine('============================================================');
printLine('  ManatOS Verify & Run');
printLine('============================================================');
printLine();
printLine(`  Output log: ${logPath}`);
printLine();

/*
 * Verification is the gate. The authoritative repository verification remains
 * exactly `npm run verify`; verifyrun only tees its output and starts ManatOS
 * when that command returns success.
 */
const verifyExitCode = await runNpm(['run', 'verify']);

if (verifyExitCode !== 0) {
  printLine();
  printLine('============================================================');
  printLine('  ManatOS NOT started - verification failed');
  printLine('============================================================');
  printLine();
  logStream.end();
  process.exit(verifyExitCode);
}

printLine();
printLine('============================================================', ANSI.boldGreen);
printLine('  ✓ Verification passed - starting ManatOS', ANSI.boldGreen);
printLine('============================================================', ANSI.boldGreen);
printLine();

/*
 * Verification succeeded. Healthy startup/watch confirmations are green in
 * the console, while verifyrun.log stays plain text and keeps both verification
 * and subsequent runtime output for the current invocation.
 */
const runExitCode = await runNpm(['run', 'dev'], { greenHealthy: true });

await new Promise((resolveEnd) => logStream.end(resolveEnd));
process.exit(runExitCode);
