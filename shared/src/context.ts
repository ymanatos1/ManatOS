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
export interface ManatOSRuntimeContext {
  /** Raw safe runtime mode (normally development/test/production). */
  mode: string;
  /** Stable declarative flag used by CTX/UI metadata for developer-only surfaces. */
  developerMode: boolean;
}
export interface ManatOSClientContext {
  kind: string;
  version: string;
  /** Safe browser/UI feature facts available to declarative expressions. */
  features: Readonly<Record<string, boolean>>;
}

/** Runtime/host facts grouped away from business/user/company context. */
export interface ManatOSSystemContext {
  /** Active runtime/application scope for the root ManatOS context. */
  scope: string;
  runtime: ManatOSRuntimeContext;
  server: ManatOSServerContext;
  client: ManatOSClientContext;
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
/**
 * Small lexical pointer node used to expose contextual state to descendants.
 *
 * Pointer nodes deliberately use the same `value` contract as stored CTX fields,
 * so the expression evaluator resolves them transparently while the CTX tree
 * still makes the contextual value explicit at the nearest owning node.
 */
export interface ManatOSContextPointer<T = unknown> {
  readonly kind: 'pointer';
  readonly value: T;
}

/** Create an immutable CTX pointer node. */
export function contextPointer<T>(value: T): ManatOSContextPointer<T> {
  return Object.freeze({ kind: 'pointer' as const, value });
}

export interface ManatOSStoredContextField<T = unknown> {
  value: T;

  /**
   * For enum/reference fields, the selected metadata/runtime option is exposed
   * as `field.option`. Expressions can therefore consume declarative traits or
   * reference labels without teaching the evaluator about a particular entity.
   */
  option?: Readonly<Record<string, unknown>> | null;

  /** Available enum/reference choices in a common evaluator-friendly shape. */
  options?: readonly Readonly<Record<string, unknown>>[];
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
   * Trusted UI decision facts resolved by the server for this platform.
   * `platformAccess` is the first universal capability: it already includes
   * the Admin bypass and license-derived entitlement result.
   */
  capabilities: Readonly<{
    platformAccess: boolean;
    [capability: string]: unknown;
  }>;
}

export interface ManatOSUserPermissionsContext {
  /** Current website/application role; kept outside fields because it is an authorization fact. */
  userRole: string;
  /** Platform ids are dynamic (for example `protocrm`). */
  [platformId: string]: string | ManatOSPlatformPermissionContext;
}

export interface ManatOSUserContext {
  /** Effective application/runtime scope owning this user context. */
  scope: string;
  /** Expression-safe ctx.entities key that supplies this user's metadata. */
  entityName: string;
  /**
   * Nearest lexical record-mode pointer for calculations owned by ctx.user.
   * The authenticated-user branch represents an already-existing entity, so
   * its stable lifecycle mode is `view`; page-entry branches expose their own
   * create/edit/view mode and therefore shadow this pointer for page fields.
   */
  mode: ManatOSContextPointer<string>;
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
 * Keys do not have to be expression identifiers: UUIDs and similar ids are
 * addressable through quoted bracket syntax, for example
 * `ctx.page.entries['8c7d...']`.
 */
export function contextCollectionMemberKey(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  for (const candidate of [record.id, record.key]) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  return null;
}

/**
 * Resolve one child member using ManatOS CTX semantics.
 *
 * Arrays keep normal zero-based numeric indexing while also supporting a
 * semantic keyed lookup for members with a stable `id`/`key`. Identifier-like
 * keys may be reached with member syntax; arbitrary ids (including UUIDs) use
 * quoted bracket syntax. This is intentionally a resolver concern: the
 * underlying CTX value remains a normal array and is not duplicated into a
 * second keyed object.
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
          ? /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(semanticKey)
            ? `${path}.${semanticKey}`
            : `${path}[${JSON.stringify(semanticKey)}]`
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
/**
 * Runtime values owned directly by one logical page.
 *
 * Important page resources intentionally live at ONE page-node level. This
 * keeps lexical expression lookup predictable: an entry-page expression can
 * request `entries`, and the resolver searches the current page, then parent
 * pages, until it finds the nearest list page exposing that resource.
 */
export interface ManatOSPageRuntimeContext {
  /** Declared/current API filter inputs on list pages. */
  filters?: Readonly<Record<string, unknown>>;
  /**
   * Actual API result rows in display order on list pages.
   *
   * This remains a real array for ordering/paging semantics, while ManatOS CTX
   * resolution treats each member as keyed by its stable `id` (or `key`) too.
   * Thus both `entries[0]` and `entries['<record-id>']` resolve the same row.
   */
  entries?: readonly Readonly<Record<string, unknown>>[];
  /** Persisted baseline for aggregate/transactional owner pages. */
  entriesOriginal?: readonly Readonly<Record<string, unknown>>[];
  /**
   * Transient child selection/editor surfaces owned by this page (for example
   * an entity-picker popup inside a hierarchy workspace). These are not page
   * levels and may be cleared when the child surface closes.
   */
  selections?: Readonly<Record<string, unknown>>;
  /**
   * Immutable working baseline captured when the page opens. Entry pages store
   * one record; transactional workspaces may store an ID-keyed collection.
   */
  entryOriginal?: Readonly<Record<string, unknown>>;
  /**
   * Live working value with the same logical shape as entryOriginal. DOM/workspace
   * adapters update this branch through CTX without mutating the baseline.
   */
  entry?: Readonly<Record<string, unknown>>;
}

export interface ManatOSPageListRuntimeContext extends ManatOSPageRuntimeContext {
  filters: Readonly<Record<string, unknown>>;
  entriesOriginal: readonly Readonly<Record<string, unknown>>[];
  entries: readonly Readonly<Record<string, unknown>>[];
}

export interface ManatOSPageWorkingRuntimeContext extends ManatOSPageRuntimeContext {
  entryOriginal: Readonly<Record<string, unknown>>;
  entry: Readonly<Record<string, unknown>>;
}

/** One-record working state used by ordinary metadata-driven entry pages. */
export type ManatOSPageEntryRuntimeContext = ManatOSPageWorkingRuntimeContext;

/** Multi-record working state used by transactional hierarchy/aggregate workspaces. */
export interface ManatOSPageCollectionRuntimeContext extends ManatOSPageRuntimeContext {
  entriesOriginal: readonly Readonly<Record<string, unknown>>[];
  entries: readonly Readonly<Record<string, unknown>>[];
}

/** Live state owned by every logical page and available to metadata expressions. */
export interface ManatOSPageStateContext {
  dirty: boolean;
  valid: boolean;
  /** True while one or more inline/child editors own an uncommitted draft. */
  internalEditing: boolean;
  /** Number of active inline/child editors on the page. Useful to diagnostics/UI. */
  internalEditorCount: number;
  saving: boolean;
  deleting: boolean;
}

export interface ManatOSPageContextNode extends ManatOSPageRuntimeContext {
  /** Effective application/runtime scope owning this logical page. */
  scope: string;
  name: string;
  kind: string;
  mode: string;
  fields: ManatOSContextFields;
  /** Live page state; decisions/actions may depend on this branch declaratively. */
  state: ManatOSPageStateContext;
  page?: ManatOSPageContextNode | null;
}

export interface ManatOSContext {
  /**
   * Runtime/host facts are intentionally the first root branch in DEBUG/CTX
   * traversal. The active root scope belongs here (`system.scope`) rather than
   * beside the major semantic context branches.
   */
  system: ManatOSSystemContext;
  entities: ManatOSEntitiesContext;
  company: ManatOSCompanyContext;
  /** Null while anonymous; populated at login and absent again after logout. */
  user: ManatOSUserContext | null;
  page: ManatOSPageContextNode | null;
}
