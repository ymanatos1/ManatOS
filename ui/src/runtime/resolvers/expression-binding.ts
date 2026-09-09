import {
  compileExpression,
  evaluateCompiledExpression,
  type CompiledExpression,
  type ExpressionNode,
  type ExpressionVariableNode,
} from '@manatos/shared';
import type { SysBOFieldMetadata } from '@manatos/shared';
import type { FieldStateRuntime } from '../state/field-state-runtime.js';
import type { SurfaceContext } from '../surface/contracts.js';

export interface V2ExpressionScope {
  readonly root: unknown;
  readonly current: unknown;
}

export type V2ExpressionRootSource =
  Readonly<Record<string, unknown>> | (() => Readonly<Record<string, unknown>>);

function resolveRootSource(source: V2ExpressionRootSource): Readonly<Record<string, unknown>> {
  return typeof source === 'function' ? source() : source;
}

export interface ExpressionBinding<T = unknown> {
  readonly expression: string;
  readonly compiled: CompiledExpression;
  readonly variablePaths: readonly string[];
  readonly fieldDependencies: readonly string[];
  /** Static dependency projection retained for diagnostics/backward-compatible callers. */
  readonly dependencyPaths: readonly string[];
  /**
   * Resolve dependencies against the same lexical owner chain used by evaluation.
   * Surface-owned dependencies are qualified with the owning surface id so a
   * descendant can react to an inherited parent-level CTX mutation without
   * confusing it with a same-named value on another level.
   */
  resolveDependencyPaths(scope: V2ExpressionScope): readonly string[];
  evaluate(scope: V2ExpressionScope, targetPath?: string): T;
}

function visitVariables(node: ExpressionNode, output: ExpressionVariableNode[]): void {
  switch (node.kind) {
    case 'variable':
      output.push(node);
      return;
    case 'array':
      for (const item of node.items) visitVariables(item, output);
      return;
    case 'binary':
      visitVariables(node.left, output);
      visitVariables(node.right, output);
      return;
    case 'unary':
      visitVariables(node.operand, output);
      return;
    case 'group':
      visitVariables(node.expression, output);
      return;
    case 'conditional':
      visitVariables(node.condition, output);
      visitVariables(node.whenTrue, output);
      visitVariables(node.whenFalse, output);
      return;
    case 'function':
      for (const argument of node.arguments) visitVariables(argument, output);
      return;
    case 'literal':
      return;
  }
}

function pathMembersText(members: readonly (string | number)[]): string {
  return members
    .map((member, index) =>
      typeof member === 'number' ? `[${member}]` : index === 0 ? member : `.${member}`,
    )
    .join('');
}

function objectLike(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function findAncestry(root: unknown, target: unknown): readonly unknown[] | null {
  if (root === target) return [root];
  if (!objectLike(root) || !objectLike(target)) return null;

  const seen = new Set<unknown>();
  const visit = (value: unknown, path: readonly unknown[]): readonly unknown[] | null => {
    if (value === target) return path;
    if (!objectLike(value) || seen.has(value)) return null;
    seen.add(value);

    const children = Array.isArray(value) ? value : Object.values(value);
    for (const child of children) {
      if (!objectLike(child)) continue;
      const found = visit(child, [...path, child]);
      if (found) return found;
    }
    return null;
  };

  return visit(root, [root]);
}

function ownsDirect(container: unknown, member: string): boolean {
  return objectLike(container) && Object.prototype.hasOwnProperty.call(container, member);
}

function surfaceIdOf(value: unknown): string | null {
  if (!objectLike(value)) return null;
  const id = value.id;
  const host = value.host;
  const kind = value.kind;
  return typeof id === 'string' && typeof host === 'string' && typeof kind === 'string' ? id : null;
}

/** Stable internal dependency identity for one semantic path owned by one surface. */
export function surfaceDependencyPath(surfaceId: string, path: string): string {
  return `surface:${surfaceId}:${path}`;
}

/**
 * Translate an expression variable into the canonical V2 dependency namespace.
 * This static form is intentionally conservative and is retained for metadata
 * inspection plus callers that do not yet have a materialized lexical scope.
 */
function expressionDependencyPath(
  variable: ExpressionVariableNode,
  knownFields: ReadonlySet<string>,
): string | null {
  const members = [...variable.members];
  if (!members.length) return null;

  if (variable.absolute) {
    members.shift(); // ctx
    if (!members.length) return null;
    return `ctx.${pathMembersText(members)}`;
  }

  const first = members[0];
  if (typeof first === 'string' && knownFields.has(first)) return `fields.${first}.value`;
  return pathMembersText(members);
}

/**
 * Resolve the dependency owner with the exact same model as expression lookup:
 * search only the first identifier current -> parent -> root, then keep the
 * remaining dotted path anchored below that owner. A nearer `state`, for
 * example, shadows every ancestor `state` as a whole object; there is no deep
 * merge or member-by-member upward fallback.
 */
function lexicalDependencyPath(
  variable: ExpressionVariableNode,
  scope: V2ExpressionScope,
  knownFields: ReadonlySet<string>,
): string | null {
  const members = [...variable.members];
  if (!members.length) return null;

  if (variable.absolute) {
    members.shift(); // ctx
    return members.length ? `ctx.${pathMembersText(members)}` : null;
  }

  const first = members[0];
  if (typeof first !== 'string') return null;

  const ancestry = findAncestry(scope.root, scope.current) ?? [scope.root, scope.current];
  for (let index = ancestry.length - 1; index >= 0; index -= 1) {
    const owner = ancestry[index];
    if (!ownsDirect(owner, first)) continue;

    const surfaceId = surfaceIdOf(owner);
    if (surfaceId) {
      const ownerRecord = owner as Record<string, unknown>;
      const ownerFields = objectLike(ownerRecord.fields)
        ? (ownerRecord.fields as Record<string, unknown>)
        : null;
      const isField = Boolean(
        ownerFields && Object.prototype.hasOwnProperty.call(ownerFields, first),
      );
      const relativePath = isField ? `fields.${first}.value` : pathMembersText(members);
      return surfaceDependencyPath(surfaceId, relativePath);
    }

    // A lexical symbol found directly on the CTX root is semantically absolute.
    if (owner === scope.root) return `ctx.${pathMembersText(members)}`;

    // Detached non-surface scopes retain the existing relative identity.
    if (knownFields.has(first)) return `fields.${first}.value`;
    return pathMembersText(members);
  }

  return expressionDependencyPath(variable, knownFields);
}

/**
 * Compile a metadata expression once and retain its AST/dependency information.
 * V2 runtime consumers evaluate this binding; they never reparse the source.
 */
export function bindExpression<T = unknown>(
  expression: string,
  knownFields: ReadonlySet<string> = new Set(),
): ExpressionBinding<T> {
  const compiled = compileExpression(expression);
  const variables: ExpressionVariableNode[] = [];
  visitVariables(compiled.ast, variables);
  const variablePaths = [...new Set(variables.map((variable) => variable.path))];
  const fieldDependencies = [
    ...new Set(
      variables
        .filter((variable) => !variable.absolute)
        .map((variable) => variable.members[0])
        .filter(
          (member): member is string => typeof member === 'string' && knownFields.has(member),
        ),
    ),
  ];
  const dependencyPaths = [
    ...new Set(
      variables
        .map((variable) => expressionDependencyPath(variable, knownFields))
        .filter((path): path is string => Boolean(path)),
    ),
  ];

  return {
    expression,
    compiled,
    variablePaths,
    fieldDependencies,
    dependencyPaths,
    resolveDependencyPaths(scope) {
      return [
        ...new Set(
          variables
            .map((variable) => lexicalDependencyPath(variable, scope, knownFields))
            .filter((path): path is string => Boolean(path)),
        ),
      ];
    },
    evaluate(scope, targetPath) {
      return evaluateCompiledExpression(compiled, scope.root, scope.current, {
        source: 'ui-metadata',
        purpose: 'V2 declarative UI resolution',
        ...(targetPath ? { targetPath } : {}),
      }) as T;
    },
  };
}

function enrichProjectedLevel(level: Record<string, unknown>): Record<string, unknown> {
  const fields = objectLike(level.fields) ? (level.fields as Record<string, unknown>) : {};
  const facts = objectLike(level.facts) ? (level.facts as Record<string, unknown>) : {};
  return { ...level, ...facts, ...fields };
}

/**
 * Rebuild the projected `ctx.ui.level` chain as lexical objects and return the
 * object owned by the requested surface. This gives the shared evaluator a real
 * object ancestry to traverse while preserving the canonical nested-level CTX
 * representation. Unknown/future UI members are copied verbatim.
 */
function lexicalizeUiChain(
  level: unknown,
  targetSurfaceId: string,
  targetOverlay: Readonly<Record<string, unknown>>,
): { level: unknown; current: unknown | null } {
  if (!objectLike(level)) return { level, current: null };

  const child = lexicalizeUiChain(level.level, targetSurfaceId, targetOverlay);
  let projected = enrichProjectedLevel({
    ...level,
    ...(child.level && objectLike(child.level) ? { level: child.level } : {}),
  });
  if (level.id === targetSurfaceId) projected = { ...projected, ...targetOverlay };

  return {
    level: projected,
    current: level.id === targetSurfaceId ? projected : child.current,
  };
}

/**
 * Build the canonical lexical scope used by V2 entry expressions. Field names
 * remain directly addressable (`firstName`) while surface facts (`mode`, state,
 * invocation) are also CTX-observable. `{ value }` field nodes preserve the
 * canonical ManatOS CTX transparency semantics.
 *
 * Model 1 lexical shadowing is deliberate: only the first identifier climbs.
 * Once `state` is found on the current level, `state.poop.var1` must resolve
 * strictly inside that state object; it never falls back to an ancestor state.
 */
export function createEntryExpressionScope(
  surface: SurfaceContext,
  fields: FieldStateRuntime,
  rootSource: V2ExpressionRootSource = {},
  fieldMetadata: Readonly<Record<string, SysBOFieldMetadata>> = {},
  referenceData: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>> = {},
): V2ExpressionScope {
  const fieldNodes = Object.fromEntries(
    fields.all().map((field) => {
      const metadata = fieldMetadata[field.name];
      if (metadata && (metadata.type === 'enum' || (metadata.optionItems?.length ?? 0) > 0)) {
        const richItems =
          metadata.type === 'enum'
            ? (metadata.enumItems ?? metadata.optionItems ?? [])
            : (metadata.optionItems ?? []);
        const runtimeOptions = referenceData[field.name];
        /*
         * Field-specific runtime reference data is the authoritative option
         * domain when present. This is how caller restrictions and
         * server-filtered option catalogues enter the canonical V2 scope.
         * Metadata still enriches matching options with stable traits/icons,
         * but it must not re-introduce options that the runtime domain removed.
         */
        const options = runtimeOptions?.length
          ? runtimeOptions.map((item) => {
              const value = item.value;
              const canonical = richItems.find((candidate) => candidate.value === value);
              return { ...(canonical ?? {}), ...item, value };
            })
          : (() => {
              const optionValues =
                metadata.type === 'enum'
                  ? (metadata.enumValues ?? richItems.map((item) => item.value))
                  : richItems.map((item) => item.value);
              return optionValues.map((value) => {
                const canonical = richItems.find((item) => item.value === value);
                return { ...(canonical ?? { value, label: String(value) }), value };
              });
            })();
        return [
          field.name,
          {
            value: field.value,
            option: options.find((item) => item.value === field.value) ?? null,
            options,
          },
        ];
      }
      if (metadata?.type === 'reference') {
        const options = referenceData[field.name] ?? [];
        return [
          field.name,
          {
            value: field.value,
            option: options.find((item) => item.id === field.value) ?? null,
            options,
          },
        ];
      }
      return [field.name, { value: field.value }];
    }),
  );
  const facts = surface.entry?.facts ?? {};
  const currentOverlay = {
    id: surface.id,
    host: surface.host,
    kind: surface.kind,
    mode: surface.mode,
    name: surface.name,
    path: surface.path,
    scope: surface.scope,
    ...(surface.entityKey ? { entityKey: surface.entityKey } : {}),
    ...(surface.recordId ? { recordId: surface.recordId } : {}),
    state: surface.state,
    invocation: surface.invocation,
    presentation: surface.presentation,
    // Runtime projection facts keep metadata expressions such as `hasPassword`
    // lexical and entity-agnostic while their canonical V2 CTX location remains
    // CurrentUiLevel().facts.hasPassword.
    facts,
    fields: fieldNodes,
    ...facts,
    ...fieldNodes,
  };

  const sourceRoot = resolveRootSource(rootSource);
  const sourceUi = objectLike(sourceRoot.ui) ? (sourceRoot.ui as Record<string, unknown>) : null;
  if (sourceUi && Object.prototype.hasOwnProperty.call(sourceUi, 'level')) {
    const lexical = lexicalizeUiChain(sourceUi.level, surface.id, currentOverlay);
    if (lexical.current) {
      const root = { ...sourceRoot, ui: { ...sourceUi, level: lexical.level } };
      return { root, current: lexical.current };
    }
  }

  // Standalone/unit-test/detached scopes still use the canonical shared fallback:
  // current first, then root. Parent traversal becomes available automatically
  // whenever the root exposes the authoritative nested ctx.ui.level chain.
  return { root: sourceRoot, current: currentOverlay };
}
