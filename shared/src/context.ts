import type { CompanyInfo, EntityContribution, SysPlatform } from './company-platform.js';
import type { ExpressionNode } from './expressions/types.js';

export interface ManatOSSysBOContext {
  key: string;
  contribution: EntityContribution;
}

export interface ManatOSPlatformContext extends SysPlatform {
  sysBO: Readonly<Record<string, ManatOSSysBOContext>>;
}

export interface ManatOSCompanyContext extends Omit<CompanyInfo, 'platforms'> {
  sysBO: Readonly<Record<string, ManatOSSysBOContext>>;
  platforms: readonly ManatOSPlatformContext[];
  currentPlatform: string;
  currentPlatformIndex: number;
}

export interface ManatOSServerContext { apiBaseUrl: string; }
export interface ManatOSClientContext { kind: string; version: string; }

/**
 * Canonical entity knowledge available from every context branch.
 *
 * Registry property names are expression-safe identifiers (for example
 * `sysUsers`); `key` preserves the canonical SysBO/API key (`sys-users`).
 * Entries can be registered later when metadata is loaded on demand.
 */
export interface ManatOSEntityContext {
  key: string;
  metadata?: unknown;
  uiMetadata?: unknown;
}
export type ManatOSEntitiesContext = Record<string, ManatOSEntityContext>;

/**
 * A page/user field owns only its runtime value. The key in `fields` IS the
 * field name, so duplicating `name` inside the value object would be redundant.
 *
 * Canonical metadata is resolved from ctx.entities on demand; it is not copied
 * into every field/page scope.
 */
export interface ManatOSStoredContextField<T = unknown> {
  value: T;
}

export interface ManatOSCalculatedContextField<T = unknown> {
  /** Optional materialized/edited anchor; normal evaluation still uses expression. */
  value: T | null;
  expression: string;
  /** Parsed, context-agnostic AST compiled when the calculated field is declared. */
  ast: ExpressionNode;
}

export type ManatOSContextField<T = unknown> =
  | ManatOSStoredContextField<T>
  | ManatOSCalculatedContextField<T>;
export type ManatOSContextFields = Record<string, ManatOSContextField>;

export interface ManatOSUserContext {
  /** Expression-safe ctx.entities key that supplies this user's metadata. */
  entityName: string;
  fields: ManatOSContextFields;
}


/**
 * A collection member may expose a stable semantic key in addition to its
 * positional array index. The expression evaluator can therefore resolve the
 * same member as `collection[0]` or `collection.semanticKey`.
 *
 * `id` is preferred because platform/domain objects already use it as their
 * stable identity; `key` is accepted for metadata-style collection members.
 */
export function contextCollectionMemberKey(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  for (const candidate of [record.id, record.key]) {
    if (typeof candidate === 'string' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Resolve one child member using ManatOS CTX semantics.
 *
 * Arrays keep normal zero-based numeric indexing while also supporting a
 * semantic keyed lookup for members with a stable expression-safe `id`/`key`.
 * This is intentionally a resolver concern: the underlying CTX value remains
 * a normal array and is not duplicated into a second keyed object.
 */
export function resolveContextMember(
  container: unknown,
  member: string | number,
): unknown {
  if (container == null) return undefined;

  if (Array.isArray(container)) {
    if (typeof member === 'number') return container[member];

    if (member in container) {
      return (container as unknown as Record<string, unknown>)[member];
    }

    return container.find((item) => contextCollectionMemberKey(item) === member);
  }

  if (typeof container !== 'object') return undefined;
  return (container as Record<string, unknown>)[String(member)];
}

/** Resolve a pre-tokenized strict downward CTX path. */
export function resolveContextMembers(
  root: unknown,
  members: readonly (string | number)[],
): unknown {
  let value = root;
  for (const member of members) {
    value = resolveContextMember(value, member);
    if (value === undefined) return undefined;
  }
  return value;
}

/**
 * One logical page scope. `name` is only this page's segment. Full `path()` is
 * derived by walking the nested page chain and is never persisted.
 */
export interface ManatOSPageContextNode {
  name: string;
  kind: string;
  mode: string;
  fields: ManatOSContextFields;
  page?: ManatOSPageContextNode | null;
}

export interface ManatOSContext {
  entities: ManatOSEntitiesContext;
  company: ManatOSCompanyContext;
  /** Null while anonymous; populated at login and absent again after logout. */
  user: ManatOSUserContext | null;
  server: ManatOSServerContext;
  client: ManatOSClientContext;
  page: ManatOSPageContextNode | null;
}
