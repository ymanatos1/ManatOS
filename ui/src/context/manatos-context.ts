import {
  type CompanyInfo,
  type ManatOSCompanyContext,
  type ManatOSContext,
  type ManatOSContextField,
  type ManatOSContextFields,
  type ManatOSEntityContext,
  type ManatOSPageContextNode,
  type ManatOSPageRuntimeContext,
  type ManatOSPageEntryRuntimeContext,
  type ManatOSPageListRuntimeContext,
  type ManatOSUserContext,
  type SysBOUser,
  type SysBOFieldMetadata,
  sysBOUsersMetadata,
  calculatedContextField,
  compileExpression,
  type SysPlatform,
} from '@manatos/shared';

const CONTEXT_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function assertContextIdentifier(value: string, purpose: string): string {
  if (!CONTEXT_IDENTIFIER.test(value)) {
    throw new Error(`Invalid ManatOS ctx ${purpose} identifier: ${value}`);
  }
  return value;
}

/**
 * Convert canonical kebab-case SysBO keys to expression-safe ctx identifiers.
 * Example: sys-users -> sysUsers. Invalid punctuation is rejected rather than
 * silently creating a name that the expression grammar cannot address.
 */
export function entityContextName(sysBOKey: string): string {
  const parts = sysBOKey.split('-');
  if (!parts.length || parts.some((part) => !part)) {
    throw new Error(`Invalid SysBO key for ctx.entities: ${sysBOKey}`);
  }

  const name = parts
    .map((part, index) =>
      index === 0 ? part : `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`,
    )
    .join('');

  return assertContextIdentifier(name, 'entity');
}

function sysBOContext(entries: CompanyInfo['entities'] | SysPlatform['entities']) {
  return Object.freeze(
    Object.fromEntries(
      entries.map((contribution) => [
        entityContextName(contribution.sysBOKey),
        Object.freeze({ key: contribution.sysBOKey, contribution }),
      ]),
    ),
  );
}

export function contextField<T>(
  value: T,
  metadata?: SysBOFieldMetadata,
): ManatOSContextField<T> {
  if (metadata?.type === 'enum' && metadata.enumItems?.length) {
    const selected = metadata.enumItems.find((item) => item.value === value) ?? null;
    return { value, option: selected ? Object.freeze({ ...selected }) : null };
  }
  return { value };
}

/**
 * Build a keyed runtime field collection. When canonical field metadata is
 * supplied, enum fields also expose their selected item under `.option` so
 * evaluator formulas can consume enum traits declaratively.
 */
export function contextFields(
  values: Readonly<Record<string, unknown>>,
  fieldDefinition: Readonly<Record<string, SysBOFieldMetadata>> = {},
): ManatOSContextFields {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      assertContextIdentifier(key, 'field'),
      contextField(value, fieldDefinition[key]),
    ]),
  );
}

function userContext(user: SysBOUser | null, currentPlatform: SysPlatform, scope: string): ManatOSUserContext | null {
  if (!user) return null;

  // passwordHash is intentionally never exposed to the browser/debug context.
  const { passwordHash: _passwordHash, ...safeUser } = user;
  const fields = contextFields(safeUser);
  for (const [derivedName, derived] of Object.entries(sysBOUsersMetadata.derivedFields ?? {})) {
    fields[derivedName] = calculatedContextField(derived.expression, {
      diagnosticSink: (diagnostic) => console.error('[ManatOS expression parse]', diagnostic),
    });
  }

  return {
    scope,
    entityName: entityContextName('sys-users'),
    fields,
    permissions: {
      userRole: user.role,
      [currentPlatform.id]: Object.freeze({
        // License/capability projection will populate this stable branch later.
        capabilities: Object.freeze({}),
      }),
    },
  };
}

/** Build the safe root context that exists for every UI request. */
export function createManatOSContext(
  company: CompanyInfo,
  currentPlatform: SysPlatform,
  apiBaseUrl: string,
  clientVersion: string,
  user: SysBOUser | null = null,
  clientFeatures: Readonly<Record<string, boolean>> = {},
  scope = 'sys',
): ManatOSContext {
  const foundPlatformIndex = company.platforms.findIndex(
    (candidate) => candidate.id === currentPlatform.id,
  );
  const currentPlatformIndex = foundPlatformIndex >= 0 ? foundPlatformIndex : 0;

  const platforms = company.platforms.map((platform) =>
    Object.freeze({
      ...platform,
      sysBO: sysBOContext(platform.entities),
    }),
  );

  const companyContext: ManatOSCompanyContext = Object.freeze({
    ...company,
    sysBO: sysBOContext(company.entities),
    platforms: Object.freeze(platforms),
    currentPlatform: currentPlatform.id,
    currentPlatformIndex,
  });

  return {
    // Keep runtime/system facts first so generic object traversal (including
    // the CTX debugger) presents the infrastructure branch before business
    // entities/company/user/page state. JavaScript preserves insertion order
    // for these string-keyed object properties.
    system: Object.freeze({
      server: Object.freeze({ apiBaseUrl }),
      client: Object.freeze({
        kind: 'web-ejs',
        version: clientVersion,
        features: Object.freeze({ ...clientFeatures }),
      }),
    }),
    scope,
    entities: {},
    company: companyContext,
    user: userContext(user, currentPlatform, scope),
    page: null,
  };
}


/**
 * Copy metadata into the runtime CTX registry and precompile every declared
 * expression, regardless of where the metadata contract uses it (canonical
 * derived field, UI-derived field, related-row calculation, future dynamic
 * visibility/read-only rule, and so on).
 *
 * Parsing remains context-agnostic. Variable/path resolution is deliberately
 * deferred until the expression value is requested. Keeping the AST beside
 * the declaration gives DEBUG immediate parser visibility without evaluation.
 */
function withCompiledExpressions(value: unknown, omitOwnKey = false): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => withCompiledExpressions(item));
  }
  if (!value || typeof value !== 'object') return value;

  const source = value as Record<string, unknown>;
  const copy: Record<string, unknown> = Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => key !== 'ast' && !(omitOwnKey && key === 'key'))
      .map(([key, child]) => [key, withCompiledExpressions(child)]),
  );

  if (typeof source.expression === 'string') {
    try {
      const compiled = compileExpression(source.expression, {
        diagnosticSink: (diagnostic) => console.error('[ManatOS expression parse]', diagnostic),
      });
      copy.ast = compiled.ast;
    } catch {
      // The compiler already emitted the diagnostic. Preserve the expression
      // text so DEBUG can expose the faulty declaration for diagnosis.
    }
  }

  return copy;
}

/**
 * Register/update canonical entity knowledge once at ctx.entities root.
 * This is intentionally mutable so metadata loaded on demand can enrich the
 * registry without copying it into every active page branch.
 */
export function registerContextEntity(
  ctx: ManatOSContext,
  sysBOKey: string,
  metadata?: unknown,
  uiMetadata?: unknown,
): ManatOSEntityContext {
  const name = entityContextName(sysBOKey);
  const existing = ctx.entities[name];
  const entity: ManatOSEntityContext = {
    key: sysBOKey,
    ...(existing ?? {}),
    ...(metadata !== undefined ? { metadata: withCompiledExpressions(metadata, true) } : {}),
    ...(uiMetadata !== undefined ? { uiMetadata: withCompiledExpressions(uiMetadata, true) } : {}),
  };
  ctx.entities[name] = entity;
  return entity;
}

export function setPageContext(
  ctx: ManatOSContext,
  page: ManatOSPageContextNode,
): ManatOSContext {
  return { ...ctx, page };
}

export function currentPageContext(ctx: ManatOSContext): ManatOSPageContextNode | null {
  let node = ctx.page;
  while (node?.page) node = node.page;
  return node;
}

/**
 * Derived page path. No path state is stored on a page node.
 * The debugger presents this as path() to make the calculated nature explicit.
 */
export function pagePath(ctx: ManatOSContext, target?: ManatOSPageContextNode): string {
  const segments: string[] = [];
  let node = ctx.page;

  while (node) {
    segments.push(node.name);
    if (target && node === target) break;
    node = node.page ?? null;
  }

  return `/${segments.filter(Boolean).join('/')}`;
}

export function currentPagePath(ctx: ManatOSContext): string {
  const leaf = currentPageContext(ctx);
  return leaf ? pagePath(ctx, leaf) : '/';
}

export interface ManatOSBreadcrumbItem {
  label: string;
  href: string | null;
}

/**
 * Derive workspace breadcrumbs from the logical CTX page chain.
 *
 * SysBO entry pages therefore naturally appear beneath their owning list page
 * (ManatOS > Principals > Edit Principal - Guest Maria) instead of flattening
 * navigation into an unrelated route-local title. The function is entity
 * agnostic: labels/links come from the canonical entity registry and the page
 * runtime context already present in CTX.
 */
export function pageBreadcrumbItems(ctx: ManatOSContext): ManatOSBreadcrumbItem[] {
  const items: ManatOSBreadcrumbItem[] = [{ label: 'ManatOS', href: '/' }];
  let node = ctx.page;
  let activeEntity: ManatOSEntityContext | null = null;

  while (node) {
    if (node.kind === 'sysbo-list') {
      const entityName = String(node.fields?.entity?.value ?? node.name ?? '');
      activeEntity = ctx.entities[entityName] ?? null;
      const metadata = activeEntity?.metadata as Record<string, unknown> | undefined;
      const label = typeof metadata?.pluralName === 'string' && metadata.pluralName
        ? metadata.pluralName
        : typeof metadata?.name === 'string' && metadata.name
          ? metadata.name
          : node.name;
      items.push({
        label,
        href: activeEntity?.key ? `/bo/${encodeURIComponent(activeEntity.key)}` : null,
      });
    } else if (node.kind === 'sysbo-entry' && activeEntity) {
      const metadata = activeEntity.metadata as Record<string, unknown> | undefined;
      const entityLabel = typeof metadata?.name === 'string' && metadata.name
        ? metadata.name
        : activeEntity.key;
      const primaryField = typeof metadata?.primaryField === 'string'
        ? metadata.primaryField
        : null;
      const current = node.dataCurrent ?? node.dataOriginal ?? {};
      const primaryValue = primaryField ? current[primaryField] : null;
      const modeLabel = node.mode === 'create' ? 'Add' : node.mode === 'view' ? 'View' : 'Edit';
      const suffix = primaryValue != null && String(primaryValue).trim()
        ? ` - ${String(primaryValue)}`
        : '';
      items.push({ label: `${modeLabel} ${entityLabel}${suffix}`, href: null });
    } else {
      const title = node.fields?.title?.value;
      if (typeof title === 'string' && title.trim()) {
        items.push({ label: title, href: null });
      }
    }
    node = node.page ?? null;
  }

  return items;
}

export function pageContextNode(
  name: string,
  kind: string,
  mode: string,
  fields: ManatOSContextFields = {},
  page: ManatOSPageContextNode | null = null,
  runtime: ManatOSPageRuntimeContext = {},
  scope = 'sys',
): ManatOSPageContextNode {
  return {
    scope,
    name: assertContextIdentifier(name, 'page'),
    kind,
    mode,
    fields,
    ...runtime,
    state: { dirty: false, valid: true, saving: false, deleting: false },
    page,
  };
}

/**
 * Build the flattened runtime values of a list-page CTX from the exact API rows
 * and the list's declared filter inputs. The row values are shallow snapshots: the UI
 * receives the same values from CTX, while later rendering code cannot
 * accidentally mutate the API response object behind the context.
 */
export function pageListRuntimeContext(
  items: readonly Readonly<Record<string, unknown>>[],
  filterFields: readonly string[],
  query: Readonly<Record<string, unknown>>,
): ManatOSPageListRuntimeContext {
  const filters = Object.fromEntries(
    filterFields.map((field) => [
      assertContextIdentifier(field, 'filter field'),
      query[`filter.${field}`] ?? null,
    ]),
  );

  return {
    filters: Object.freeze(filters),
    dataList: Object.freeze(items.map((item) => Object.freeze({ ...item }))),
  };
}

/**
 * Build the flattened runtime values owned by a SysBO entry page. `dataOriginal`
 * is the immutable baseline and `dataCurrent` is the working record. Both intentionally
 * have the same record shape so dirtiness is a direct structural comparison.
 */
export function pageEntryRuntimeContext(
  entry: Readonly<Record<string, unknown>>,
): ManatOSPageEntryRuntimeContext {
  const dataOriginal = Object.freeze({ ...entry });
  return {
    dataOriginal,
    // The working record always starts strictly from the finalized baseline,
    // for both create defaults and existing persisted data.
    dataCurrent: Object.freeze({ ...dataOriginal }),
  };
}
