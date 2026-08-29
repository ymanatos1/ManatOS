import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const command = isWindows ? process.env.ComSpec || 'cmd.exe' : 'npm';

function npmArgs(...args) {
  return isWindows ? ['/d', '/s', '/c', `npm ${args.join(' ')}`] : args;
}

/**
 * Runs an npm command and resolves with its process exit code.
 *
 * stdio is inherited deliberately so that verify/dev behave exactly as they
 * do when invoked directly from the terminal.
 */
function runNpm(...args) {
  return new Promise((resolve) => {
    const child = spawn(command, npmArgs(...args), {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('error', (error) => {
      console.error(`Failed to execute npm ${args.join(' ')}: ${error.message}`);
      resolve(1);
    });

    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });
}

console.log('');
console.log('============================================================');
console.log('  ManatOS Verify & Run');
console.log('============================================================');
console.log('');

/*
 * Verification is the gate.
 *
 * verify.mjs already returns:
 *   0 -> every required build/test passed
 *   1 -> at least one required build/test failed
 */
const verifyExitCode = await runNpm('run', 'verify');

if (verifyExitCode !== 0) {
  console.log('');
  console.log('============================================================');
  console.log('  ManatOS NOT started - verification failed');
  console.log('============================================================');
  console.log('');

  process.exit(verifyExitCode);
}

console.log('');
console.log('============================================================');
console.log('  Verification passed - starting ManatOS');
console.log('============================================================');
console.log('');

/*
 * Verification succeeded. Hand control to the normal development startup
 * command and preserve its eventual exit code.
 */
const runExitCode = await runNpm('run', 'dev');

process.exit(runExitCode);
