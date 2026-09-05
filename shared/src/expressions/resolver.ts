import { resolveContextMember } from '../context.js';
import type { ExpressionPathMember, ExpressionVariableNode } from './types.js';

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

function resolveMemberForExpression(container: unknown, member: ExpressionPathMember): unknown {
  const direct = resolveContextMember(container, member);
  if (direct !== undefined) return direct;

  /*
   * CTX field/pointer nodes are transparent for ordinary nested fact access.
   * Metadata should be able to say `permissions.create` even though the CTX tree
   * stores `permissions` as a normal field node `{ value: { create, ... } }`.
   * Explicit CTX members such as `.value`, `.option`, `.expression` and `.ast`
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

function resolveDownward(
  start: unknown,
  members: readonly ExpressionPathMember[],
): ResolvedExpressionVariable {
  let value = start;
  let owner: unknown = undefined;
  for (const member of members) {
    owner = value;
    value = resolveMemberForExpression(value, member);
    if (value === undefined) return { found: false, value: undefined, owner };
  }
  return { found: true, value, owner };
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
): ResolvedExpressionVariable {
  const members = [...variable.members];
  if (!members.length) return { found: false, value: undefined, owner: undefined };

  if (variable.absolute) {
    members.shift(); // explicit ctx root marker
    return members.length
      ? resolveDownward(ctxRoot, members)
      : { found: true, value: ctxRoot, owner: undefined };
  }

  const first = members.shift()!;
  if (typeof first !== 'string') return { found: false, value: undefined, owner: undefined };

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
    const resolved = resolveDownward(firstValue, members);
    return resolved.found ? resolved : { found: false, value: undefined, owner: resolved.owner };
  }

  return { found: false, value: undefined, owner: undefined };
}
