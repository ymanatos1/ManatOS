import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const command = isWindows ? process.env.ComSpec || 'cmd.exe' : 'npm';

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
      if (line.endsWith('\r')) line = line.slice(0, -1);
      target.write(`${prefix} ${line}\n`);
      onLine?.(line);
      newline = pending.indexOf('\n');
    }
  });
  stream.on('end', () => {
    if (!pending) return;
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
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  // On Windows, child shells/watchers may need a moment to consume termination.
  setTimeout(() => process.exit(exitCode), 100).unref();
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

/*
 * @manatos/shared is a compiled workspace package. API/UI load its dist exports
 * at process startup, so they must not race the shared watch compiler's initial
 * emission. Wait for that compiler to report a complete, error-free initial
 * pass before starting either consumer. Subsequent shared changes remain watched
 * normally by the long-lived compiler and the consumer watch processes.
 */
let consumersStarted = false;
startNpm('[0]', ['run', 'dev', '--workspace', 'shared'], (line) => {
  if (consumersStarted || !/Found 0 errors\. Watching for file changes\./.test(line)) return;
  consumersStarted = true;
  startNpm('[1]', ['run', 'dev', '--workspace', 'api']);
  startNpm('[2]', ['run', 'dev', '--workspace', 'ui.EJS0']);
});
