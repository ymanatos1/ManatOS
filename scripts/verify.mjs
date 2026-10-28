import {
  parseWorkspaceFamily,
  workspaceBelongsToFamily,
  workspaceFamilies,
} from './workspace-families.mjs';
import { spawn } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? process.env.ComSpec || 'cmd.exe' : 'npm';
const family = parseWorkspaceFamily();

const familyPaths = family === null ? [] : workspaceFamilies[family];

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
    args:
      family === null
        ? npmArgs('run', 'lint')
        : npmArgs('exec', '--', 'eslint', ...familyPaths),
    kind: 'quality',
  },
  {
    key: 'formatCheck',
    label: 'Prettier',
    command: npmCommand,
    args:
      family === null
        ? npmArgs('run', 'format:check')
        : npmArgs('exec', '--', 'prettier', '--check', ...familyPaths),
    kind: 'quality',
  },
  {
    key: 'sharedBuild',
    label: 'Shared build',
    command: npmCommand,
    args: npmArgs('run', 'build', '--workspace', 'shared'),
    kind: 'build',
    workspace: 'shared',
  },
  {
    key: 'sharedUIBuild',
    label: 'Shared UI build',
    command: npmCommand,
    args: npmArgs('run', 'build', '--workspace', 'shared.UI'),
    kind: 'build',
    workspace: 'shared.UI',
  },
  {
    key: 'sharedUINGBuild',
    label: 'Shared UI.NG build',
    command: npmCommand,
    args: npmArgs('run', 'build', '--workspace', 'shared.UI.NG'),
    kind: 'build',
    workspace: 'shared.UI.NG',
  },
  {
    key: 'sharedUIEJSBuild',
    label: 'Shared UI.EJS build',
    command: npmCommand,
    args: npmArgs('run', 'build', '--workspace', 'shared.UI.EJS'),
    kind: 'build',
    workspace: 'shared.UI.EJS',
  },
  {
    key: 'apiBuild',
    label: 'API build',
    command: npmCommand,
    args: npmArgs('run', 'build', '--workspace', 'api'),
    kind: 'build',
    workspace: 'api',
  },
  {
    key: 'uiEJS0Build',
    label: 'UI.EJS0 build',
    command: npmCommand,
    args: npmArgs('run', 'build', '--workspace', 'ui.EJS0'),
    kind: 'build',
    workspace: 'ui.EJS0',
  },
  {
    key: 'uiNG1Build',
    label: 'UI.NG1 build',
    command: npmCommand,
    args: npmArgs('run', 'build', '--workspace', 'ui.NG1'),
    kind: 'build',
    workspace: 'ui.NG1',
  },
  {
    key: 'uiEJS1Build',
    label: 'UI.EJS1 build',
    command: npmCommand,
    args: npmArgs('run', 'build', '--workspace', 'ui.EJS1'),
    kind: 'build',
    workspace: 'ui.EJS1',
  },
  {
    key: 'apiTests',
    label: 'API tests',
    command: npmCommand,
    args: npmArgs('run', 'test', '--workspace', 'api'),
    kind: 'test',
    workspace: 'api',
  },
  {
    key: 'sharedTests',
    label: 'Shared tests',
    command: npmCommand,
    args: npmArgs('run', 'test', '--workspace', 'shared'),
    kind: 'test',
    workspace: 'shared',
  },
  {
    key: 'sharedUITests',
    label: 'Shared UI tests',
    command: npmCommand,
    args: npmArgs('run', 'test', '--workspace', 'shared.UI'),
    kind: 'test',
    workspace: 'shared.UI',
  },
  {
    key: 'sharedUINGTests',
    label: 'Shared UI.NG tests',
    command: npmCommand,
    args: npmArgs('run', 'test', '--workspace', 'shared.UI.NG'),
    kind: 'test',
    workspace: 'shared.UI.NG',
  },
  {
    key: 'sharedUIEJSTests',
    label: 'Shared UI.EJS tests',
    command: npmCommand,
    args: npmArgs('run', 'test', '--workspace', 'shared.UI.EJS'),
    kind: 'test',
    workspace: 'shared.UI.EJS',
  },
  {
    key: 'uiEJS0Tests',
    label: 'UI.EJS0 tests',
    command: npmCommand,
    args: npmArgs('run', 'test', '--workspace', 'ui.EJS0'),
    kind: 'test',
    workspace: 'ui.EJS0',
  },
  {
    key: 'uiNG1Tests',
    label: 'UI.NG1 tests',
    command: npmCommand,
    args: npmArgs('run', 'test', '--workspace', 'ui.NG1'),
    kind: 'test',
    workspace: 'ui.NG1',
  },
  {
    key: 'uiEJS1Tests',
    label: 'UI.EJS1 tests',
    command: npmCommand,
    args: npmArgs('run', 'test', '--workspace', 'ui.EJS1'),
    kind: 'test',
    workspace: 'ui.EJS1',
  },
];

const selectedSteps = steps.filter(
  (step) => !step.workspace || workspaceBelongsToFamily(step.workspace, family),
);

const results = Object.fromEntries(
  selectedSteps.map((step) => [
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
         * ANSI colour/control sequences may be present in captured terminal
         * output, so strip them before parsing.
         */
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
  const testResults = selectedSteps
    .filter((step) => step.kind === 'test')
    .map((step) => results[step.key]);

  const numericResults = testResults.filter(
    (result) => result.passed !== null && result.total !== null,
  );

  const totalPassed = numericResults.reduce((sum, result) => sum + result.passed, 0);
  const totalTests = numericResults.reduce((sum, result) => sum + result.total, 0);
  const allSelectedTestsRan = numericResults.length === testResults.length;
  const overallStatus = success ? 'PASS' : 'FAIL';
  const totalText = allSelectedTestsRan
    ? colorResult(overallStatus, totalPassed, totalTests)
    : colorStatus('NOT RUN');
  const titleColor = success ? colors.green : colors.red;
  const scope = family ? ` (${family} family)` : '';

  console.log('');
  console.log('============================================================');
  console.log(
    `  ${colors.bold}${titleColor}ManatOS verification${scope} ${
      success ? 'PASSED' : 'FAILED'
    }${colors.reset}`,
  );
  console.log('============================================================');

  for (const step of selectedSteps.filter((candidate) => candidate.kind === 'quality')) {
    console.log(`  ${step.label.padEnd(20)} ${colorStatus(results[step.key].status)}`);
  }

  console.log('');
  for (const step of selectedSteps.filter((candidate) => candidate.kind === 'build')) {
    console.log(`  ${(step.label + ':').padEnd(20)} ${colorStatus(results[step.key].status)}`);
  }

  console.log('');
  for (const step of selectedSteps.filter((candidate) => candidate.kind === 'test')) {
    const result = results[step.key];
    console.log(
      `  ${(step.label + ':').padEnd(20)} ${colorResult(result.status, result.passed, result.total)}`,
    );
  }

  console.log('');
  console.log(`  ${'Total tests:'.padEnd(20)} ${totalText}`);
  console.log('============================================================');
  console.log('');
}

let success = true;

for (const step of selectedSteps) {
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
