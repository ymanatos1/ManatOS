import {
  appendContextPathMember,
  evaluateExpressionAsync,
  tokenizeContextPath,
  type ContextTreeRuntime,
  type ExpressionCapabilityDelegate,
  type ExpressionDiagnosticSink,
  type ManatOSRuntimeRootContext,
} from '@manatos/shared';

import {
  formatCtxPath,
  formatCtxValue,
  nearestExistingCtxPath,
  projectCtxChildren,
} from '../ctx-inspection.js';

export interface CtxCliCommandInput {
  readonly context: ContextTreeRuntime<ManatOSRuntimeRootContext>;
  readonly currentPath: string;
  readonly source: string;
  readonly expressionCapabilityDelegate?: ExpressionCapabilityDelegate | null;
  readonly expressionDiagnosticSink?: ExpressionDiagnosticSink;
}

export interface CtxCliCommandResult {
  readonly currentPath: string;
  readonly output?: string;
  readonly clearTranscript?: boolean;
}

const CTX_CLI_HELP = [
  'help / ?          Show this help',
  'aliases           Show supported CTX aliases',
  'cd <path>         Change CTX execution path ($/$runtime absolute; child/../ relative)',
  '. [ls] [full]     Show current CTX node (shallow by default)',
  '.. [ls] [full]    Move to parent CTX node and show it',
  'ls                List direct child nodes',
  'full [expr]       Pretty-print current node or expression result',
  'clear / cls       Clear this CLI transcript',
  '<expression>      Evaluate a ManatOS expression relative to the current CTX node',
].join('\n');

/** CTX aliases are shared by expression evaluation and CLI; 'cd' has a narrower path grammar. */
const CTX_CLI_ALIASES = [
  'CTX aliases                                 Meaning',
  '────────────────────────────────────────────────────────────────────────',
  '$                                           CTX root',
  '$company                                    Company metadata ($.company)',
  '$system                                     System metadata ($.system)',
  '$runtime                                    Effective runtime ($.runtime)',
  '$entities                                   Runtime entity catalogue ($.runtime.entities)',
  '$enums                                      Runtime enumerations ($.runtime.enums)',
  '$user                                       Current user ($.runtime.user)',
  '$ui                                         UI context ($.ui, when present)',
  '$flow                                       Current Flow ($.flow, nullable)',
  '#flowstep                                   Executing Flow step (when available)',
  '$name                                       Root member shorthand ($.name)',
  '#                                           Parent of the current context',
  '#level                                      Nearest enclosing UI level',
  '#control                                    Current level control namespace',
  '#state                                      Current level state namespace',
  '#layout                                     Current level layout namespace',
  '#data                                       Current level data namespace',
  '$entity                                     Entity named by the current entityName',
  '$entity-fields                              Metadata field definitions of $entity',
  '$entry-current                              Lexical entry.current',
  '$level-entity                               Entity named by #control.entityName',
  '$level-entity-fields                        Field definitions of $level-entity',
  '',
  'Aliases are interpreted within the current CTX expression context.',
  'Some aliases require an enclosing level or entityName to exist.',
  'The cd command supports only its documented navigation path syntax.',
].join('\n');

export async function executeCtxCliCommand(
  input: CtxCliCommandInput,
): Promise<CtxCliCommandResult> {
  const source = input.source.trim();
  const currentPath = normalizeCtxCliPath(input.currentPath);
  if (!source) return { currentPath };

  const [commandName, ...parts] = source.split(/\s+/);
  const command = commandName.toLowerCase();

  if (command === 'help' || command === '?') return { currentPath, output: CTX_CLI_HELP };
  if (command === 'aliases' && parts.length === 0) return { currentPath, output: CTX_CLI_ALIASES };
  if (command === 'clear' || command === 'cls') return { currentPath, clearTranscript: true };

  const contextCommand = /^(\.\.?)(?:\s+(ls|full))*?(?:\s+(ls|full))?$/.exec(source);
  if (contextCommand) {
    const family = contextCommand[1]!;
    const modifiers = source.slice(family.length).trim().split(/\s+/).filter(Boolean);
    if (!modifiers.every((modifier) => modifier === 'ls' || modifier === 'full')) {
      throw new Error(`Unsupported CTX command modifier: ${modifiers.join(' ')}`);
    }

    const target =
      family === '..'
        ? nearestExistingCtxPath(input.context, ctxCliParentPath(currentPath))
        : currentPath;
    return {
      currentPath: target,
      output: modifiers.includes('full')
        ? formatCtxValue(input.context.get(target))
        : shallowCtxCliNode(input.context, target),
    };
  }

  if (command === 'cd') {
    const target = parts.join(' ').trim();
    if (!target) return { currentPath, output: formatCtxPath(currentPath) };
    const path = resolveCtxCliPath(currentPath, target);
    if (input.context.get(path) === undefined && path !== 'ctx') {
      throw new Error(`CTX path not found: ${target}`);
    }
    return { currentPath: path, output: formatCtxPath(path) };
  }

  if (command === 'ls') {
    return { currentPath, output: shallowCtxCliNode(input.context, currentPath) };
  }

  if (command === 'full') {
    const expression = source.slice(commandName.length).trim();
    const value = expression
      ? await evaluateCtxCliExpression(input, currentPath, expression)
      : input.context.get(currentPath);
    return { currentPath, output: formatCtxValue(value) };
  }

  const value = await evaluateCtxCliExpression(input, currentPath, source);
  return {
    currentPath,
    output:
      value && typeof value === 'object'
        ? formatCtxValue(value)
        : value === undefined
          ? 'undefined'
          : String(value),
  };
}

function resolveCtxCliPath(currentPath: string, value: string): string {
  let raw = value.trim();
  if (!raw || raw === '.') return normalizeCtxCliPath(currentPath);
  if (raw === '$' || raw === 'ctx') return 'ctx';
  if (raw.startsWith('$.')) return normalizeCtxCliPath(`ctx.${raw.slice(2)}`);
  if (raw.startsWith('$[')) return normalizeCtxCliPath(`ctx${raw.slice(1)}`);
  if (/^\$(company|system|runtime|entities|enums|user)(?:\.|\[|$)/.test(raw)) {
    return normalizeCtxCliPath(`ctx.${raw.slice(1)}`);
  }
  if (raw.startsWith('ctx')) return normalizeCtxCliPath(raw);

  let path = normalizeCtxCliPath(currentPath);
  while (raw === '..' || raw.startsWith('../')) {
    path = ctxCliParentPath(path);
    raw = raw === '..' ? '' : raw.slice(3);
  }
  if (raw.startsWith('./')) raw = raw.slice(2);
  if (!raw) return path;

  for (const member of tokenizeContextPath(raw.replaceAll('/', '.'))) {
    path = appendContextPathMember(path, member);
  }
  return path;
}

export function normalizeCtxCliPath(value: string): string {
  let path = 'ctx';
  for (const member of tokenizeContextPath(value)) path = appendContextPathMember(path, member);
  return path;
}

function ctxCliParentPath(path: string): string {
  const members = [...tokenizeContextPath(path)];
  members.pop();
  let parent = 'ctx';
  for (const member of members) parent = appendContextPathMember(parent, member);
  return parent;
}

function shallowCtxCliNode(
  context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
  path: string,
): string {
  const value = context.get(path);
  if (!value || typeof value !== 'object') return formatCtxValue(value);
  const children = projectCtxChildren(context, path);
  return children.length
    ? children.map((child) => `${child.key}\t${child.preview}`).join('\n')
    : '(no children)';
}

function evaluateCtxCliExpression(
  input: CtxCliCommandInput,
  currentPath: string,
  expression: string,
): Promise<unknown> {
  const delegate = input.expressionCapabilityDelegate ?? null;
  return evaluateExpressionAsync(
    expression,
    {
      owner: 'browser-ctx-debugger',
      root: input.context.root(),
      scope: input.context.get(currentPath),
      capabilities: ['pure', 'clock', 'ctx'],
      ...(delegate ? { capabilityDelegate: delegate } : {}),
    },
    {
      source: 'ctx-debugger',
      sourcePath: currentPath,
      purpose: 'Developer CLI',
    },
    input.expressionDiagnosticSink ? { diagnosticSink: input.expressionDiagnosticSink } : {},
  );
}
