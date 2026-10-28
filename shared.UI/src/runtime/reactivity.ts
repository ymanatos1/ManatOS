import {
  appendContextPathMember,
  compileExpression,
  ContextTreeRuntime,
  evaluateCompiledExpression,
  reactiveDependencyMatchesChange,
  type CompiledExpression,
  type ExpressionNode,
  type ExpressionVariableNode,
  type ManatOSRuntimeRootContext,
} from '@manatos/shared';

export interface UiReactiveExpression {
  readonly key: string;
  readonly outputPath: string;
  readonly expression: string | null;
}

interface ReactiveEntry {
  readonly key: string;
  readonly outputPath: string;
  readonly compiled: CompiledExpression | null;
  readonly dependencies: readonly string[];
  readonly error: string | null;
}

/**
 * Converts AST variable references into canonical CTX paths.
 *
 * Static #data and #state references are precise. Dynamic or
 * lexically ambiguous references conservatively depend on
 * the CTX root, rather than silently missing a change.
 */
function variableDependency(variable: ExpressionVariableNode, levelPath: string): string {
  const members: Array<string | number> = [];

  for (const raw of variable.members) {
    const member = typeof raw === 'object' && raw.kind === 'resolved-path' ? raw.member : raw;

    if (typeof member !== 'string' && typeof member !== 'number') return 'ctx';

    members.push(member);
  }

  const first = members.shift();
  let path: string;

  if (variable.absolute || first === '$') {
    path = 'ctx';
  } else if (first === '#level') {
    path = levelPath;
  } else if (
    first === '#data' ||
    first === '#state' ||
    first === '#control' ||
    first === '#layout'
  ) {
    path = appendContextPathMember(levelPath, first.slice(1));
  } else {
    return 'ctx';
  }

  for (const member of members) {
    path = appendContextPathMember(path, member);
  }

  return path;
}

function dependencies(compiled: CompiledExpression, levelPath: string): readonly string[] {
  const result = new Set<string>();

  const visit = (node: ExpressionNode): void => {
    switch (node.kind) {
      case 'variable':
        result.add(variableDependency(node, levelPath));
        break;
      case 'array':
        node.items.forEach(visit);
        break;
      case 'binary':
        visit(node.left);
        visit(node.right);
        break;
      case 'unary':
        visit(node.operand);
        break;
      case 'group':
        visit(node.expression);
        break;
      case 'conditional':
        visit(node.condition);
        visit(node.whenTrue);
        visit(node.whenFalse);
        break;
      case 'function':
        node.arguments.forEach(visit);
        break;
      case 'literal':
        break;
    }
  };

  visit(compiled.ast);
  return [...result];
}

/**
 * One reactive expression registry per semantic UI #level.
 *
 * Initial evaluation visits all declared entries once.
 * Later mutations enqueue ONLY expressions depending on
 * the changed CTX paths.
 *
 * Derived writes generate ordinary CTX events, allowing
 * dependent expressions to run in causal order.
 */
export class UiReactivityRuntime {
  private readonly entries: readonly ReactiveEntry[];
  private readonly pending = new Set<ReactiveEntry>();
  private readonly errors = new Map<string, string>();
  private readonly unsubscribe: () => void;

  private processing = false;
  private disposed = false;

  constructor(
    private readonly context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
    private readonly levelPath: string,
    expressions: readonly UiReactiveExpression[],
    private readonly errorPath: string | null = null,
  ) {
    this.entries = expressions.map((entry) => {
      const key = entry.key;
      try {
        const compiled = entry.expression ? compileExpression(entry.expression) : null;

        return {
          key,
          outputPath: entry.outputPath,
          compiled,
          dependencies: compiled ? dependencies(compiled, levelPath) : [],
          error: null,
        };
      } catch (error) {
        return {
          key,
          outputPath: entry.outputPath,
          compiled: null,
          dependencies: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Subscribe before evaluating: derived writes must activate dependent expressions
    // even when declarations are out of dependency order.
    this.unsubscribe = this.context.subscribe((mutation) => this.enqueue(mutation.paths), {
      label: `ui-reactivity:${levelPath}`,
      async: false,
    });
    try {
      for (const entry of this.entries) this.pending.add(entry);
      this.flush();
    } catch (error) {
      this.unsubscribe();
      throw error;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.pending.clear();
    this.errors.clear();
  }

  private enqueue(changedPaths: readonly string[]): void {
    if (this.disposed) return;

    for (const entry of this.entries) {
      if (
        entry.dependencies.some((dependency) =>
          changedPaths.some((path) => reactiveDependencyMatchesChange(dependency, path)),
        )
      ) {
        this.pending.add(entry);
      }
    }

    this.flush();
  }

  private flush(): void {
    if (this.processing || this.disposed) return;
    this.processing = true;
    try {
      let evaluations = 0;
      let lastEvaluated = '(none)';
      // Allow realistic dependency chains, while bounding nonconvergent cycles.
      const budget = Math.max(256, this.entries.length * this.entries.length * 4);
      while (this.pending.size > 0) {
        if (++evaluations > budget) {
          const remaining = [...this.pending].map((pending) => pending.key);
          this.pending.clear();
          this.recordError(
            'scheduler',
            `UI expressions did not converge after ${budget} evaluations (${this.entries.length} registrations). Pending: ${remaining.slice(0, 20).join(', ') || '(none)'}${remaining.length > 20 ? ` (+${remaining.length - 20} more)` : ''}. Last evaluated: ${lastEvaluated}.`,
          );
          break;
        }

        const entry = this.pending.values().next().value;
        if (!entry) break;

        this.pending.delete(entry);
        lastEvaluated = entry.key;
        this.evaluate(entry);
      }
    } finally {
      this.processing = false;
    }
  }

  private evaluate(entry: ReactiveEntry): void {
    let next = true;
    let error = entry.error;

    if (entry.compiled) {
      try {
        next =
          evaluateCompiledExpression(
            entry.compiled,
            this.context.root(),
            this.context.get(this.levelPath),
            {
              source: 'renderer',
              sourcePath: entry.outputPath,
              purpose: 'UI reactive expression',
            },
          ) === true;
        error = null;
      } catch (caught) {
        next = false;
        error = caught instanceof Error ? caught.message : String(caught);
      }
    } else if (error) {
      next = false;
    }

    this.recordError(entry.key, error);

    // The equality check prevents redundant CTX events and
    // unnecessary downstream expression reevaluation.
    if (!Object.is(this.context.get(entry.outputPath), next)) {
      this.context.set(entry.outputPath, next);
    }
  }

  private recordError(key: string, message: string | null): void {
    const previous = this.errors.get(key) ?? null;
    if (previous === message) return;

    if (message) this.errors.set(key, message);
    else this.errors.delete(key);

    if (this.errorPath) this.context.set(this.errorPath, Object.fromEntries(this.errors));
  }
}
