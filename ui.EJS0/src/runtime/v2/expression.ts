import {
  compileExpression,
  evaluateCompiledExpression,
  type CompiledExpression,
  type ExpressionNode,
} from '@manatos/shared/expressions';

import type { UiContext, UiCtxChange } from './ui-context.js';

export interface UiExpressionDependency {
  readonly path: string;
  readonly absolute: boolean;
}

export interface UiExpressionDefinition<T = unknown> {
  readonly expression: string;
  readonly fallback?: T;
}

export type UiDynamicValue<T> = T | UiExpressionDefinition<T>;
export type UiExpressionListener<T> = (value: T, change: UiCtxChange) => void;

/**
 * One CTX-native expression instance. Compilation is delegated to Shared's process-global AST
 * cache; this object owns only one consumer's evaluation/subscription lifetime.
 */
export class UiExpressionRuntime<T = unknown> {
  readonly compiled: CompiledExpression;
  readonly dependencies: readonly UiExpressionDependency[];

  constructor(
    readonly context: UiContext,
    readonly definition: UiExpressionDefinition<T>,
    readonly targetPath: string,
    readonly purpose: string,
  ) {
    this.compiled = compileExpression(definition.expression);
    this.dependencies = expressionDependencies(this.compiled.ast);
  }

  evaluate(): T {
    const value = evaluateCompiledExpression(
      this.compiled,
      this.context.port.value,
      this.context.value,
      {
        source: 'ui-metadata',
        sourcePath: this.context.path,
        targetPath: this.targetPath,
        purpose: this.purpose,
      },
    );
    return (
      value === undefined && 'fallback' in this.definition ? this.definition.fallback : value
    ) as T;
  }

  /**
   * React through the canonical CTX subscription stream. Relative dependencies share the owning
   * level subscription because expression lexical lookup may resolve through level ancestry;
   * explicit root dependencies subscribe at their canonical root path.
   */
  subscribe(listener: UiExpressionListener<T>): () => void {
    if (!this.context.port.subscribe) {
      throw new Error('Canonical CTX subscriptions are not available.');
    }
    const disposers: Array<() => void> = [];
    const relative = this.dependencies.some((dependency) => !dependency.absolute);
    if (relative) {
      disposers.push(
        this.context.port.subscribe(
          this.context.path,
          (change) => listener(this.evaluate(), change),
          { kind: 'expression', label: this.targetPath },
        ),
      );
    }
    for (const dependency of this.dependencies.filter((item) => item.absolute)) {
      const path = dependency.path.replace(/^\$\.?/, '');
      if (!path) continue;
      disposers.push(
        this.context.port.subscribe(path, (change) => listener(this.evaluate(), change), {
          kind: 'expression',
          label: this.targetPath,
        }),
      );
    }
    return () => {
      for (const dispose of disposers.reverse()) dispose();
    };
  }
}

export function resolveUiDynamicValue<T>(
  context: UiContext,
  declaration: UiDynamicValue<T> | undefined,
  fallback: T,
  targetPath: string,
  purpose: string,
): T {
  if (declaration === undefined) return fallback;
  if (!isUiExpressionDefinition(declaration)) return declaration;
  return new UiExpressionRuntime(context, declaration, targetPath, purpose).evaluate();
}

export function isUiExpressionDefinition<T>(
  value: UiDynamicValue<T>,
): value is UiExpressionDefinition<T> {
  return typeof value === 'object' && value !== null && 'expression' in value;
}

export function expressionDependencies(ast: ExpressionNode): readonly UiExpressionDependency[] {
  const dependencies = new Map<string, UiExpressionDependency>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const node = value as Partial<ExpressionNode> & { path?: unknown; absolute?: unknown };
    if (node.kind === 'variable' && typeof node.path === 'string') {
      const dependency = { path: node.path, absolute: node.absolute === true } as const;
      dependencies.set(`${dependency.absolute}:${dependency.path}`, dependency);
    }
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  visit(ast);
  return [...dependencies.values()];
}
