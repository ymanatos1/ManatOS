import { resolveContextMember } from '../context/manatos-context.js';
import { ExpressionEvaluationError } from './diagnostics.js';
import type { ExpressionNode, ExpressionPathMember, ExpressionVariableNode } from './types.js';

export interface ResolvedExpressionVariable {
  found: boolean;
  value: unknown;
  /** Container that owns the last resolved member, useful for field evaluation scope. */
  owner: unknown;
}

function objectLike(value: unknown): value is Record<string | number, unknown> {
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

function resolveMemberForExpression(container: unknown, member: string | number): unknown {
  const direct = resolveContextMember(container, member);
  if (direct !== undefined) return direct;

  /*
   * CTX field/pointer nodes are transparent for ordinary nested fact access.
   * Metadata should be able to say `permissions.create` even though the CTX tree
   * stores `permissions` as a normal field node `{ value: { create, ... } }`.
   * Explicit CTX members such as `.value`, `.option` and `.expression`
   * still win above, so enum/reference/calculated-field introspection keeps its
   * existing semantics.
   */
  if (
    container &&
    typeof container === 'object' &&
    Object.prototype.hasOwnProperty.call(container, 'value')
  ) {
    return resolveContextMember((container as { value?: unknown }).value, member);
  }

  return undefined;
}

export interface ExpressionPathResolutionOptions {
  /** Evaluate a parenthesized dynamic path segment in the caller's current expression scope. */
  evaluateDynamicPath?: (expression: ExpressionNode) => unknown;
}

function dynamicPathKey(
  member: ExpressionPathMember,
  options: ExpressionPathResolutionOptions,
): string | number {
  if (typeof member === 'string' || typeof member === 'number') return member;
  const value = options.evaluateDynamicPath?.(member.expression);
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  throw new ExpressionEvaluationError(
    `Dynamic CTX path segment (${member.source}) must resolve to a non-empty string or non-negative integer; received ${type}.`,
  );
}

function resolveDownward(
  start: unknown,
  members: readonly ExpressionPathMember[],
  options: ExpressionPathResolutionOptions,
): ResolvedExpressionVariable {
  let value = start;
  let owner: unknown = undefined;
  for (const rawMember of members) {
    const member = dynamicPathKey(rawMember, options);
    owner = value;
    value = resolveMemberForExpression(value, member);
    if (value === undefined) return { found: false, value: undefined, owner };
  }
  return { found: true, value, owner };
}

function isUiLevel(value: unknown): boolean {
  if (!objectLike(value)) return false;
  const control = objectLike((value as { control?: unknown }).control)
    ? ((value as { control: Record<string, unknown> }).control as Record<string, unknown>)
    : value;
  const host = control.host;
  const kind = control.kind;
  return (host === 'page' || host === 'popup') && typeof kind === 'string';
}

function selectedRelativeScope(
  selector: string,
  ctxRoot: unknown,
  currentCtxNode: unknown,
): unknown | undefined {
  const ancestry = findAncestry(ctxRoot, currentCtxNode);
  if (!ancestry) return undefined;
  if (selector === '#') return ancestry.length >= 2 ? ancestry[ancestry.length - 2] : undefined;
  if (selector === '#level') {
    for (let index = ancestry.length - 1; index >= 0; index -= 1) {
      if (isUiLevel(ancestry[index])) return ancestry[index];
    }
  }
  return undefined;
}

/**
 * Resolve one expression variable using the fixed ManatOS lexical rule:
 * only the first identifier searches current -> parent -> root; after it is
 * found, all remaining path members resolve strictly downward.
 */
export function resolveExpressionVariable(
  variable: ExpressionVariableNode,
  ctxRoot: unknown,
  currentCtxNode: unknown,
  options: ExpressionPathResolutionOptions = {},
): ResolvedExpressionVariable {
  const members = [...variable.members];
  if (!members.length) return { found: false, value: undefined, owner: undefined };

  if (variable.absolute) {
    members.shift(); // explicit $ root marker
    return members.length
      ? resolveDownward(ctxRoot, members, options)
      : { found: true, value: ctxRoot, owner: undefined };
  }

  const first = members.shift()!;
  if (typeof first !== 'string') return { found: false, value: undefined, owner: undefined };

  if (first === '#' || first === '#level') {
    const selected = selectedRelativeScope(first, ctxRoot, currentCtxNode);
    if (selected === undefined) return { found: false, value: undefined, owner: undefined };
    return members.length
      ? resolveDownward(selected, members, options)
      : { found: true, value: selected, owner: undefined };
  }

  // A detached current scope (for example a related-record row) is not a child
  // of the root object. Preserve the same lexical rule by constructing the
  // synthetic ancestry root -> current; the reverse walk below still searches
  // current first and root last.
  const ancestry = findAncestry(ctxRoot, currentCtxNode) ?? [ctxRoot, currentCtxNode];
  for (let index = ancestry.length - 1; index >= 0; index -= 1) {
    const scope = ancestry[index];
    const firstValue = resolveContextMember(scope, first);
    if (firstValue === undefined) continue;
    if (!members.length) return { found: true, value: firstValue, owner: scope };
    const resolved = resolveDownward(firstValue, members, options);
    return resolved.found ? resolved : { found: false, value: undefined, owner: resolved.owner };
  }

  return { found: false, value: undefined, owner: undefined };
}

export interface AsyncExpressionPathResolutionOptions {
  evaluateDynamicPath: (expression: ExpressionNode) => Promise<unknown>;
}

async function dynamicPathKeyAsync(
  member: ExpressionPathMember,
  options: AsyncExpressionPathResolutionOptions,
): Promise<string | number> {
  if (typeof member === 'string' || typeof member === 'number') return member;
  const value = await options.evaluateDynamicPath(member.expression);
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  throw new ExpressionEvaluationError(
    `Dynamic CTX path segment (${member.source}) must resolve to a non-empty string or non-negative integer; received ${type}.`,
  );
}

async function resolveDownwardAsync(
  start: unknown,
  members: readonly ExpressionPathMember[],
  options: AsyncExpressionPathResolutionOptions,
): Promise<ResolvedExpressionVariable> {
  let value = start;
  let owner: unknown = undefined;
  for (const rawMember of members) {
    const member = await dynamicPathKeyAsync(rawMember, options);
    owner = value;
    value = resolveMemberForExpression(value, member);
    if (value === undefined) return { found: false, value: undefined, owner };
  }
  return { found: true, value, owner };
}

/** Async equivalent used by owner-aware evaluation when a dynamic segment itself needs async evaluation. */
export async function resolveExpressionVariableAsync(
  variable: ExpressionVariableNode,
  ctxRoot: unknown,
  currentCtxNode: unknown,
  options: AsyncExpressionPathResolutionOptions,
): Promise<ResolvedExpressionVariable> {
  const members = [...variable.members];
  if (!members.length) return { found: false, value: undefined, owner: undefined };

  if (variable.absolute) {
    members.shift();
    return members.length
      ? resolveDownwardAsync(ctxRoot, members, options)
      : { found: true, value: ctxRoot, owner: undefined };
  }

  const first = members.shift()!;
  if (typeof first !== 'string') return { found: false, value: undefined, owner: undefined };

  if (first === '#' || first === '#level') {
    const selected = selectedRelativeScope(first, ctxRoot, currentCtxNode);
    if (selected === undefined) return { found: false, value: undefined, owner: undefined };
    return members.length
      ? resolveDownwardAsync(selected, members, options)
      : { found: true, value: selected, owner: undefined };
  }

  const ancestry = findAncestry(ctxRoot, currentCtxNode) ?? [ctxRoot, currentCtxNode];
  for (let index = ancestry.length - 1; index >= 0; index -= 1) {
    const scope = ancestry[index];
    const firstValue = resolveContextMember(scope, first);
    if (firstValue === undefined) continue;
    if (!members.length) return { found: true, value: firstValue, owner: scope };
    const resolved = await resolveDownwardAsync(firstValue, members, options);
    return resolved.found ? resolved : { found: false, value: undefined, owner: resolved.owner };
  }

  return { found: false, value: undefined, owner: undefined };
}
