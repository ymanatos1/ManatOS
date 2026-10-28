import type { CompanyInfo, SysPlatform } from '../domain/company-platform.js';
import type { ManatOSSubsystemContextProjection } from '../metadata/subsystems/registry.js';

export interface ManatOSSysBOContext {
  key: string;
  contribution: Readonly<{ sysBOKey: string }>;
}

export interface ManatOSPlatformContext extends SysPlatform {
  sysBO: Readonly<Record<string, ManatOSSysBOContext>>;
}

export interface ManatOSCompanyContext extends Omit<CompanyInfo, 'platforms'> {
  sysBO: Readonly<Record<string, ManatOSSysBOContext>>;
  platforms: readonly ManatOSPlatformContext[];
  currentPlatform: string | null;
  currentPlatformIndex: number;
}

/** Company catalogue used by the modern runtime without duplicated entity catalogues. */
export interface ManatOSRuntimeCompanyContext extends Omit<CompanyInfo, 'platforms'> {
  platforms: readonly SysPlatform[];
  currentPlatform: string | null;
  currentPlatformIndex: number;
}

export interface ManatOSServerContext {
  apiBaseUrl: string;
}
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

/** Stable runtime/host facts grouped away from business/user/company context. */
export interface ManatOSHostSystemContext {
  /** Active runtime/application scope for the root ManatOS context. */
  scope: string;
  runtime: ManatOSRuntimeContext;
  server: ManatOSServerContext;
  client: ManatOSClientContext;
}

/** Legacy system context retained for EJS0/API compatibility. */
export interface ManatOSSystemContext extends ManatOSHostSystemContext {
  /** Effective ManatOS + selected-platform subsystem catalogue. */
  subsystems: Readonly<Record<string, ManatOSSubsystemContextProjection>>;
}

/**
 * Canonical entity knowledge available from every context branch.
 *
 * Registry property names are canonical symbolic entity names declared by
 * metadata (for example `sysUsers` or `sysExternalIdentities`). `key` preserves
 * the secondary metadata/storage/API key (`sys-users`, `external-identities`, etc.).
 * Entries may describe either
 * first-class SysBOs or canonical related/value objects and can be enriched
 * later when metadata is loaded on demand.
 */
export interface ManatOSEntityContext {
  /** Secondary metadata/storage/API key retained for its explicit technical uses. */
  key: string;
  /** Canonical symbolic entity name; this is also the ctx.entities property key. */
  name: string;
  /** Owning subsystem, projected directly for CTX/debugger discovery. */
  subsystem: string;
  metadata?: unknown;
  uiMetadata?: unknown;
  /** Canonical metadata-derived entry representation for browser/runtime consumers. */
  entryRepresentation?: unknown;
  /** Canonical UI entity icon when this entity has a UI definition. */
  icon?: string;
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
}

export type ManatOSContextField<T = unknown> =
  ManatOSStoredContextField<T> | ManatOSCalculatedContextField<T>;
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
  /** Current website/application role, available to evaluator-driven role-specific presentation. */
  userRole: string;
  /**
   * Request-wide platform capability facts, keyed by canonical platform id.
   * Record/entity CRUD capabilities do not belong here because they are scoped
   * to the active page/record and are exposed by that page's `permissions`.
   */
  platforms: Readonly<Record<string, ManatOSPlatformPermissionContext>>;
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
 * `ctx.ui.level.data.list.entries['8c7d...']`.
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
/** Marks a modern CTX root whose legacy names are resolver aliases, not members. */
export const MODERN_CTX_ALIASES = Symbol.for('manatos.ctx.runtime-aliases');

export function resolveContextMember(container: unknown, member: string | number): unknown {
  if (container == null) return undefined;

  if (Array.isArray(container)) {
    if (typeof member === 'number') return container[member];

    if (member in container) {
      return (container as unknown as Record<string, unknown>)[member];
    }

    return container.find((item) => contextCollectionMemberKey(item) === member);
  }

  if (typeof container !== 'object') return undefined;
  // The expression evaluator and CTX share this lookup. Only the marked root
  // redirects these names; ordinary nested objects retain their own members.
  if (
    (container as Record<symbol, unknown>)[MODERN_CTX_ALIASES] === true &&
    (member === 'entities' || member === 'enums' || member === 'user')
  ) {
    const runtime = (container as { runtime?: Record<string, unknown> }).runtime;
    return runtime?.[member];
  }
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

export interface ManatOSEnumContext {
  key: string;
  name: string;
  subsystem: string;
  label: string;
  values: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

export type ManatOSEnumsContext = Record<string, ManatOSEnumContext>;

/**
 * Canonical effective execution projection for modern ManatOS clients.
 *
 * Immutable metadata defines what can exist. This branch defines what is
 * effective for the currently selected Company + Platform + User combination.
 */
export interface ManatOSEffectiveRuntimeContext {
  subsystems: Readonly<Record<string, ManatOSSubsystemContextProjection>>;
  entities: ManatOSEntitiesContext;
  enums: ManatOSEnumsContext;
  user: ManatOSUserContext | null;
}

/**
 * Modern root CTX used by EJS1/NG1 and later clients.
 *
 * `$entities`, `$enums` and `$user` are resolver aliases of `runtime.*`.
 * They are deliberately not enumerable root members.
 */
/** Live Flow CTX identity; step payloads are owned by the FlowRunner. */
export interface ManatOSRuntimeFlowContext {
  readonly control: {
    readonly host: 'flow';
    readonly kind: 'flow';
    readonly name: string;
    readonly instanceId: string;
    readonly status: string;
    readonly currentStep: { readonly kind: 'pointer'; readonly value: string } | null;
  };
  readonly steps: Record<string, unknown>;
}

export interface ManatOSRuntimeRootContext {
  system: ManatOSHostSystemContext;
  company: ManatOSRuntimeCompanyContext;
  runtime: ManatOSEffectiveRuntimeContext;
  /** Current Flow execution, or null when no Flow is running. */
  flow?: ManatOSRuntimeFlowContext | null;
}

export interface ManatOSContext {
  /**
   * Runtime/host facts are intentionally the first root branch in DEBUG/CTX
   * traversal. The active root scope belongs here (`system.scope`) rather than
   * beside the major semantic context branches.
   */
  system: ManatOSSystemContext;
  /** Effective enum catalogue for the selected subsystem composition. */
  enums: ManatOSEnumsContext;
  entities: ManatOSEntitiesContext;
  company: ManatOSCompanyContext;
  /** Null while anonymous; populated at login and absent again after logout. */
  user: ManatOSUserContext | null;
}
