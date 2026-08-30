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
export interface ManatOSClientContext {
  kind: string;
  version: string;
  /** Safe browser/UI feature facts available to declarative expressions. */
  features: Readonly<Record<string, boolean>>;
}

/**
 * Canonical entity knowledge available from every context branch.
 *
 * Registry property names are expression-safe identifiers (for example
 * `sysUsers` or `externalIdentities`); `key` preserves the canonical metadata
 * key (`sys-users`, `external-identities`, etc.). Entries may describe either
 * first-class SysBOs or canonical related/value objects and can be enriched
 * later when metadata is loaded on demand.
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

export interface ManatOSPlatformPermissionContext {
  /**
   * Reserved capability bucket for the selected platform.  The structure is
   * intentionally present even before individual license-derived capabilities
   * are projected into CTX, so expressions/debugging have a stable location.
   */
  capabilities: Readonly<Record<string, unknown>>;
}

export interface ManatOSUserPermissionsContext {
  /** Current website/application role; kept outside fields because it is an authorization fact. */
  userRole: string;
  /** Platform ids are dynamic (for example `mcrm`). */
  [platformId: string]: string | ManatOSPlatformPermissionContext;
}

export interface ManatOSUserContext {
  /** Expression-safe ctx.entities key that supplies this user's metadata. */
  entityName: string;
  fields: ManatOSContextFields;
  /** Effective authorization context available to expressions and DEBUG. */
  permissions: ManatOSUserPermissionsContext;
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
 * Return the canonical debugger/diagnostic path of a value inside a CTX tree.
 *
 * This is intentionally identity-based: it reports the path of the exact
 * object supplied to the evaluator. Detached scopes (for example a temporary
 * related row that is not currently attached to ctx) return null.
 */
export function contextPathOf(ctxRoot: unknown, target: unknown): string | null {
  if (ctxRoot === target) return 'ctx';
  if (!ctxRoot || typeof ctxRoot !== 'object' || !target || typeof target !== 'object') {
    return null;
  }

  const seen = new Set<unknown>();

  const visit = (value: unknown, path: string): string | null => {
    if (value === target) return path;
    if (!value || typeof value !== 'object' || seen.has(value)) return null;
    seen.add(value);

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const child = value[index];
        const semanticKey = contextCollectionMemberKey(child);
        const childPath = semanticKey
          ? `${path}.${semanticKey}`
          : `${path}[${index}]`;
        const found = visit(child, childPath);
        if (found) return found;
      }
      return null;
    }

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (!child || typeof child !== 'object') continue;
      const found = visit(child, `${path}.${key}`);
      if (found) return found;
    }
    return null;
  };

  return visit(ctxRoot, 'ctx');
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
