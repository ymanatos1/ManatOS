import { spawn } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? process.env.ComSpec || 'cmd.exe' : 'npm';

const colors = {
  green: '\u001b[32m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  bold: '\u001b[1m',
  reset: '\u001b[0m',
};

function npmArgs(...args) {
  return isWindows ? ['/d', '/s', '/c', `npm ${args.join(' ')}`] : args;
}

const steps = [
  {
    key: 'lint',
    label: 'ESLint',
    command: npmCommand,
    args: npmArgs('run', 'lint'),
    kind: 'quality',
  },
  {
    key: 'formatCheck',
    label: 'Prettier',
    command: npmCommand,
    args: npmArgs('run', 'format:check'),
    kind: 'quality',
  },
  {
    key: 'sharedBuild',
    label: 'Shared build',
    command: npmCommand,
    args: npmArgs('run', 'build', '--workspace', 'shared'),
    kind: 'build',
  },
  {
    key: 'apiBuild',
    label: 'API build',
    command: npmCommand,
    args: npmArgs('run', 'build', '--workspace', 'api'),
    kind: 'build',
  },
  {
    key: 'uiBuild',
    label: 'UI build',
    command: npmCommand,
    args: npmArgs('run', 'build', '--workspace', 'ui'),
    kind: 'build',
  },
  {
    key: 'apiTests',
    label: 'API tests',
    command: npmCommand,
    args: npmArgs('run', 'test', '--workspace', 'api'),
    kind: 'test',
  },
  {
    key: 'uiTests',
    label: 'UI tests',
    command: npmCommand,
    args: npmArgs('run', 'test', '--workspace', 'ui'),
    kind: 'test',
  },
];

const results = Object.fromEntries(
  steps.map((step) => [
    step.key,
    {
      label: step.label,
      kind: step.kind,
      status: 'NOT RUN',
      passed: null,
      total: null,
    },
  ]),
);

function runStep(step) {
  return new Promise((resolve) => {
    let output = '';

    const child = spawn(step.command, step.args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: process.env,
    });

    child.on('error', (error) => {
      console.error(`\nFailed to start ${step.label}: ${error.message}`);
      results[step.key].status = 'FAIL';
      resolve(1);
    });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      const result = results[step.key];

      result.status = code === 0 ? 'PASS' : 'FAIL';

      if (step.kind === 'test') {
        /*
         * Extract Vitest's final test summary.
         *
         * Successful run:
         *   Tests  65 passed (65)
         *
         * Failed run:
         *   Tests  1 failed | 64 passed (65)
         *
         * ANSI colour/control sequences may be present in captured terminal output,
         * so strip them before parsing.
         */
        //const cleanOutput = output.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
        const cleanOutput = stripVTControlCharacters(output);

        const summaryLine = cleanOutput.split(/\r?\n/).find((line) => /^\s*Tests\s+/.test(line));

        if (summaryLine) {
          const passedMatch = summaryLine.match(/(\d+)\s+passed/);
          const totalMatch = summaryLine.match(/\((\d+)\)\s*$/);

          result.passed = passedMatch ? Number(passedMatch[1]) : 0;
          result.total = totalMatch ? Number(totalMatch[1]) : null;
        }
      }

      resolve(code ?? 1);
    });
  });
}

function colorStatus(status) {
  switch (status) {
    case 'PASS':
      return `${colors.green}PASS${colors.reset}`;

    case 'FAIL':
      return `${colors.red}FAIL${colors.reset}`;

    case 'NOT RUN':
      return `${colors.yellow}NOT RUN${colors.reset}`;

    default:
      return status;
  }
}

function colorResult(status, passed, total) {
  if (status === 'NOT RUN') {
    return colorStatus(status);
  }

  if (passed !== null && total !== null) {
    return `${colorStatus(status)}  ${passed}/${total}`;
  }

  return colorStatus(status);
}

function printSummary(success) {
  const api = results.apiTests;
  const ui = results.uiTests;

  const numericResults = [api, ui].filter(
    (result) => result.passed !== null && result.total !== null,
  );

  const totalPassed = numericResults.reduce((sum, result) => sum + result.passed, 0);

  const totalTests = numericResults.reduce((sum, result) => sum + result.total, 0);

  const overallStatus = success ? 'PASS' : 'FAIL';

  const totalText =
    numericResults.length === 2
      ? colorResult(overallStatus, totalPassed, totalTests)
      : colorStatus('NOT RUN');

  const titleColor = success ? colors.green : colors.red;

  console.log('');
  console.log('============================================================');
  console.log(
    `  ${colors.bold}${titleColor}ManatOS verification ${
      success ? 'PASSED' : 'FAILED'
    }${colors.reset}`,
  );
  console.log('============================================================');

  console.log(`  ESLint:       ${colorStatus(results.lint.status)}`);
  console.log(`  Prettier:     ${colorStatus(results.formatCheck.status)}`);

  console.log('');
  console.log(`  Shared build: ${colorStatus(results.sharedBuild.status)}`);
  console.log(`  API build:    ${colorStatus(results.apiBuild.status)}`);
  console.log(`  UI build:     ${colorStatus(results.uiBuild.status)}`);

  console.log('');
  console.log(`  API tests:    ${colorResult(api.status, api.passed, api.total)}`);
  console.log(`  UI tests:     ${colorResult(ui.status, ui.passed, ui.total)}`);

  console.log('');
  console.log(`  Total tests:  ${totalText}`);
  console.log('============================================================');
  console.log('');
}

let success = true;

for (const step of steps) {
  const exitCode = await runStep(step);

  if (exitCode !== 0) {
    success = false;

    /*
     * Stop at the first failing step, matching the old `&&` behavior.
     * The final summary still appears and marks later steps as NOT RUN.
     */
    break;
  }
}

printSummary(success);

process.exit(success ? 0 : 1);
