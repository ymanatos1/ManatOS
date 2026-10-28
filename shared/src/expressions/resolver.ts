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

function resolution(member: ExpressionPathMember): {
  member: ExpressionPathMember;
  optional: boolean;
} {
  return typeof member === 'object' && member.kind === 'resolved-path'
    ? { member: member.member, optional: member.optional }
    : { member, optional: false };
}

function dynamicPathKey(
  member: ExpressionPathMember,
  options: ExpressionPathResolutionOptions,
): string | number {
  if (typeof member === 'string' || typeof member === 'number') return member;
  if (member.kind !== 'dynamic-path') {
    throw new ExpressionEvaluationError('Invalid dynamic CTX path segment.');
  }
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
    const resolved = resolution(rawMember);
    const member = dynamicPathKey(resolved.member, options);

    owner = value;
    value = resolveMemberForExpression(value, member);

    if (value === undefined) {
      return resolved.optional
        ? { found: true, value: null, owner }
        : { found: false, value: undefined, owner };
    }

    if (resolved.optional && value === null) {
      return { found: true, value: null, owner };
    }
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
  return (host === 'page' || host === 'popup' || host === 'embedded') && typeof kind === 'string';
}

function flowStepScope(root: unknown, ancestry: readonly unknown[]): unknown | undefined {
  // Prefer the lexical step (future async/parallel execution can keep its own
  // scope). UI-hosted events resolve the active Step via the Flow pointer.
  for (let index = ancestry.length - 1; index >= 0; index -= 1) {
    const candidate = ancestry[index];
    if (!objectLike(candidate) || !objectLike(candidate['control'])) continue;
    const control = candidate['control'] as Record<string, unknown>;
    if (control['host'] === 'flow' && control['kind'] === 'step') return candidate;
  }
  if (!objectLike(root) || !objectLike(root['flow'])) return undefined;
  const flow = root['flow'] as Record<string, unknown>;
  const control = flow['control'];
  if (!objectLike(control) || !objectLike(control['currentStep'])) return undefined;
  const path = control['currentStep']['value'];
  if (typeof path !== 'string' || !path.startsWith('ctx.flow.steps.')) return undefined;
  let current: unknown = root;
  for (const member of path.slice(4).split('.')) {
    current = resolveContextMember(current, member);
    if (current === undefined) return undefined;
  }
  return current;
}

function selectedRelativeScope(
  selector: string,
  ctxRoot: unknown,
  currentCtxNode: unknown,
): unknown | undefined {
  const ancestry = findAncestry(ctxRoot, currentCtxNode);
  if (!ancestry) return undefined;
  if (selector === '#') return ancestry.length >= 2 ? ancestry[ancestry.length - 2] : undefined;
  if (selector === '#flowstep') return flowStepScope(ctxRoot, ancestry);
  if (['#level', '#control', '#data', '#layout', '#state'].includes(selector)) {
    for (let index = ancestry.length - 1; index >= 0; index -= 1) {
      if (!isUiLevel(ancestry[index])) continue;
      const level = ancestry[index] as Record<string, unknown>;
      if (selector === '#level') return level;
      return level[selector.slice(1)];
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

  const firstResolution = resolution(members.shift()!);
  const first = firstResolution.member;
  const firstOptional = firstResolution.optional;

  if (typeof first !== 'string') {
    return { found: false, value: undefined, owner: undefined };
  }

  if (['#', '#level', '#control', '#data', '#layout', '#state', '#flowstep'].includes(first)) {
    const selected = selectedRelativeScope(first, ctxRoot, currentCtxNode);

    if (selected === undefined) {
      return firstOptional
        ? { found: true, value: null, owner: undefined }
        : { found: false, value: undefined, owner: undefined };
    }

    if (firstOptional && selected === null) {
      return { found: true, value: null, owner: undefined };
    }

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

    if (firstOptional && firstValue === null) {
      return { found: true, value: null, owner: scope };
    }

    if (!members.length) return { found: true, value: firstValue, owner: scope };
    const resolved = resolveDownward(firstValue, members, options);
    return resolved.found ? resolved : { found: false, value: undefined, owner: resolved.owner };
  }

  return firstOptional
    ? { found: true, value: null, owner: undefined }
    : { found: false, value: undefined, owner: undefined };
}

export interface AsyncExpressionPathResolutionOptions {
  evaluateDynamicPath: (expression: ExpressionNode) => Promise<unknown>;
}

async function dynamicPathKeyAsync(
  member: ExpressionPathMember,
  options: AsyncExpressionPathResolutionOptions,
): Promise<string | number> {
  if (typeof member === 'string' || typeof member === 'number') return member;
  if (member.kind !== 'dynamic-path') {
    throw new ExpressionEvaluationError('Invalid dynamic CTX path segment.');
  }
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
    const resolved = resolution(rawMember);
    const member = await dynamicPathKeyAsync(resolved.member, options);

    owner = value;
    value = resolveMemberForExpression(value, member);

    if (value === undefined) {
      return resolved.optional
        ? { found: true, value: null, owner }
        : { found: false, value: undefined, owner };
    }

    if (resolved.optional && value === null) {
      return { found: true, value: null, owner };
    }
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

  const firstResolution = resolution(members.shift()!);
  const first = firstResolution.member;
  const firstOptional = firstResolution.optional;

  if (typeof first !== 'string') {
    return { found: false, value: undefined, owner: undefined };
  }

  if (['#', '#level', '#control', '#data', '#layout', '#state', '#flowstep'].includes(first)) {
    const selected = selectedRelativeScope(first, ctxRoot, currentCtxNode);

    if (selected === undefined) {
      return firstOptional
        ? { found: true, value: null, owner: undefined }
        : { found: false, value: undefined, owner: undefined };
    }

    if (firstOptional && selected === null) {
      return { found: true, value: null, owner: undefined };
    }

    return members.length
      ? resolveDownwardAsync(selected, members, options)
      : { found: true, value: selected, owner: undefined };
  }

  const ancestry = findAncestry(ctxRoot, currentCtxNode) ?? [ctxRoot, currentCtxNode];
  for (let index = ancestry.length - 1; index >= 0; index -= 1) {
    const scope = ancestry[index];
    const firstValue = resolveContextMember(scope, first);
    if (firstValue === undefined) continue;

    if (firstOptional && firstValue === null) {
      return { found: true, value: null, owner: scope };
    }

    if (!members.length) return { found: true, value: firstValue, owner: scope };
    const resolved = await resolveDownwardAsync(firstValue, members, options);
    return resolved.found ? resolved : { found: false, value: undefined, owner: resolved.owner };
  }

  return firstOptional
    ? { found: true, value: null, owner: undefined }
    : { found: false, value: undefined, owner: undefined };
}
