import { parseWorkspaceFamily } from './workspace-families.mjs';
import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const command = isWindows ? process.env.ComSpec || 'cmd.exe' : 'npm';
const family = parseWorkspaceFamily();
const runApi = family === null || family === 'api';
const runUi = family === null || family === 'uis';

function npmArgs(...args) {
  return isWindows ? ['/d', '/s', '/c', `npm ${args.join(' ')}`] : args;
}

const children = new Set();
let stopping = false;

function prefixStream(stream, target, prefix, onLine) {
  let pending = '';

  stream.on('data', (chunk) => {
    pending += chunk.toString();

    let newline = pending.indexOf('\n');

    while (newline >= 0) {
      let line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);

      if (line.endsWith('\r')) {
        line = line.slice(0, -1);
      }

      target.write(`${prefix} ${line}\n`);
      onLine?.(line);

      newline = pending.indexOf('\n');
    }
  });

  stream.on('end', () => {
    if (!pending) {
      return;
    }

    target.write(`${prefix} ${pending}`);
    onLine?.(pending);
    pending = '';
  });
}

function startNpm(label, args, onStdoutLine) {
  const child = spawn(command, npmArgs(...args), {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
  });

  children.add(child);

  prefixStream(child.stdout, process.stdout, label, onStdoutLine);
  prefixStream(child.stderr, process.stderr, label);

  child.on('close', (code) => {
    children.delete(child);

    if (!stopping && code !== 0) {
      process.stderr.write(`${label} exited with code ${code ?? 1}.\n`);
      stop(code ?? 1);
    }
  });

  child.on('error', (error) => {
    process.stderr.write(`${label} failed to start: ${error.message}\n`);
    stop(1);
  });

  return child;
}

function stop(exitCode = 0) {
  if (stopping) {
    return;
  }

  stopping = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }

  // On Windows, child shells/watchers may need a moment to consume termination.
  setTimeout(() => process.exit(exitCode), 100).unref();
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

/*
 * Workspace startup dependency chain:
 *
 *   shared
 *      ↓
 *   shared.UI
 *      ├───────────────┐
 *      ↓               ↓
 *   shared.UI.NG   shared.UI.EJS
 *      └───────┬───────┘
 *              ↓
 *      API / UI consumers
 *
 * Compiled workspace packages must complete their initial error-free build
 * before dependent long-lived processes are started. Subsequent changes remain
 * handled by the individual watch processes.
 */

let sharedUIStarted = false;
let sharedUIAdaptersStarted = false;

let sharedUINGReady = false;
let sharedUIEJSReady = false;

let consumersStarted = false;

function startConsumersWhenReady() {
  if (consumersStarted || !sharedUINGReady || !sharedUIEJSReady) {
    return;
  }

  consumersStarted = true;

  if (runApi) startNpm('[4]', ['run', 'dev', '--workspace', 'api']);
  if (runUi) {
    startNpm('[5]', ['run', 'dev', '--workspace', 'ui.EJS0']);
    startNpm('[6]', ['run', 'dev', '--workspace', 'ui.NG1']);
    startNpm('[7]', ['run', 'dev', '--workspace', 'ui.EJS1']);
  }
}

startNpm('[0]', ['run', 'dev', '--workspace', 'shared'], (line) => {
  if (sharedUIStarted || !/Found 0 errors\. Watching for file changes\./.test(line)) {
    return;
  }

  sharedUIStarted = true;

  if (!runUi) {
    startNpm('[4]', ['run', 'dev', '--workspace', 'api']);
    return;
  }

  startNpm('[1]', ['run', 'dev', '--workspace', 'shared.UI'], (sharedUILine) => {
    if (
      sharedUIAdaptersStarted ||
      !/Found 0 errors\. Watching for file changes\./.test(sharedUILine)
    ) {
      return;
    }

    sharedUIAdaptersStarted = true;

    startNpm('[2]', ['run', 'dev', '--workspace', 'shared.UI.NG'], (sharedUINGLine) => {
      if (
        sharedUINGReady ||
        !/(Built|Packaging Angular library|Watching for file changes)/i.test(sharedUINGLine)
      ) {
        return;
      }

      sharedUINGReady = true;
      startConsumersWhenReady();
    });

    startNpm('[3]', ['run', 'dev', '--workspace', 'shared.UI.EJS'], (sharedUIEJSLine) => {
      if (
        sharedUIEJSReady ||
        !/Found 0 errors\. Watching for file changes\./.test(sharedUIEJSLine)
      ) {
        return;
      }

      sharedUIEJSReady = true;
      startConsumersWhenReady();
    });
  });
});
