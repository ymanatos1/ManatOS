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
  type ManatOSPageCollectionRuntimeContext,
  type ManatOSPageListRuntimeContext,
  type ManatOSUserContext,
  type SysBOUser,
  type SysBOFieldMetadata,
  sysBOUsersMetadata,
  calculatedContextField,
  contextPointer,
  compileExpression,
  type SysPlatform,
  type PlatformAuthorizationCapabilities,
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
  referenceOptions?: readonly Readonly<Record<string, unknown>>[],
): ManatOSContextField<T> {
  if (metadata?.type === 'enum') {
    /*
     * Enum fields expose the same stable `options` shape as references so
     * evaluator-backed defaults can reason about available choices without
     * knowing whether the control is an enum or a relationship selector.
     *
     * A caller may provide contextual enum options (for example a create page
     * that must omit values already represented by existing records). Those
     * options are a generic CTX concern, not an entity-renderer exception.
     * Canonical enumItems still provide the fallback label/icon/tone contract,
     * while contextual properties may enrich or narrow the available choices.
     */
    const richItems = metadata.enumItems ?? [];
    const hasContextualOptions = referenceOptions !== undefined;
    const contextualItems = (referenceOptions ?? []).filter(
      (option) => typeof option.value === 'string' || typeof option.value === 'number',
    );
    const availableValues = hasContextualOptions
      ? contextualItems.map((option) => option.value)
      : (metadata.enumValues ?? []);
    const options = Object.freeze(
      availableValues.map((enumValue) => {
        const canonical = richItems.find((item) => item.value === enumValue);
        const contextual = contextualItems.find((item) => item.value === enumValue);
        return Object.freeze({
          ...(canonical ? { ...canonical } : { value: enumValue, label: String(enumValue) }),
          ...(contextual ? { ...contextual } : {}),
          value: enumValue,
          label: String(contextual?.label ?? canonical?.label ?? enumValue),
        });
      }),
    );
    const selected = options.find((option) => option.value === value) ?? null;
    return { value, option: selected, options };
  }

  if (metadata?.type === 'reference') {
    const options = Object.freeze((referenceOptions ?? []).map((option) => Object.freeze({ ...option })));
    const selected = options.find((option) => option.id === value) ?? null;
    return {
      value,
      option: selected,
      options,
    };
  }

  return { value };
}

/**
 * Build a keyed runtime field collection. Enum and reference fields expose
 * their selected item under `.option` plus the available `.options` collection.
 * This shared shape lets generic formulas inspect/select available choices
 * without coupling to a particular HTML control or field type. This keeps generic
 * defaults/calculations CTX-driven rather than tied to renderer lookup tables.
 */
export function contextFields(
  values: Readonly<Record<string, unknown>>,
  fieldDefinition: Readonly<Record<string, SysBOFieldMetadata>> = {},
  referenceData: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>> = {},
): ManatOSContextFields {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      assertContextIdentifier(key, 'field'),
      contextField(
        value,
        fieldDefinition[key],
        Object.prototype.hasOwnProperty.call(referenceData, key) ? referenceData[key] : undefined,
      ),
    ]),
  );
}

function userContext(
  user: SysBOUser | null,
  currentPlatform: SysPlatform,
  scope: string,
  platformCapabilities: Readonly<PlatformAuthorizationCapabilities>,
): ManatOSUserContext | null {
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
    // Node-power rule: descendants resolve contextual values from their nearest
    // semantic owner before walking farther up the CTX tree. ctx.user represents
    // the already-authenticated User, so it exposes its own stable mode pointer
    // instead of borrowing the active page's unrelated create/edit/view state.
    mode: contextPointer('view'),
    fields,
    permissions: {
      userRole: user.role,
      platforms: Object.freeze({
        [currentPlatform.id]: Object.freeze({
          capabilities: Object.freeze({
            ...platformCapabilities,
          }),
        }),
      }),
    },
  };
}

/** Build the safe root context that exists for every UI request. */
/**
 * Read the server-resolved platform-access capability from CTX.
 *
 * CTX is the authoritative request decision surface for renderer/navigation
 * decisions. Callers should not mirror this fact into `app.*` or rebuild it
 * from roles/licenses after the context has been created.
 */
export function contextPlatformAccess(
  ctx: ManatOSContext | null | undefined,
  platformId: string,
): boolean {
  if (!ctx?.user || !platformId) return false;
  const permission = ctx.user.permissions.platforms[platformId];
  return permission?.capabilities.platformAccess === true;
}


export function createManatOSContext(
  company: CompanyInfo,
  currentPlatform: SysPlatform,
  apiBaseUrl: string,
  clientVersion: string,
  user: SysBOUser | null = null,
  clientFeatures: Readonly<Record<string, boolean>> = {},
  scope = 'sys',
  runtimeMode = 'development',
  platformCapabilities: Readonly<PlatformAuthorizationCapabilities> = { platformAccess: false },
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
      scope,
      runtime: Object.freeze({
        mode: runtimeMode,
        developerMode: runtimeMode !== 'production',
      }),
      server: Object.freeze({ apiBaseUrl }),
      client: Object.freeze({
        kind: 'web-ejs',
        version: clientVersion,
        features: Object.freeze({ ...clientFeatures }),
      }),
    }),
    entities: {},
    company: companyContext,
    user: userContext(user, currentPlatform, scope, platformCapabilities),
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
      const current = node.entry ?? node.entryOriginal ?? {};
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
    state: { dirty: false, valid: true, internalEditing: false, internalEditorCount: 0, saving: false, deleting: false },
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
  const filters = {
    ...Object.fromEntries(
      filterFields.map((field) => [
        assertContextIdentifier(field, 'filter field'),
        query[`filter.${field}`] ?? null,
      ]),
    ),
    // Every list-like CTX exposes the same exclusion-predicate slot. Normal
    // browse pages usually carry null; selectors/search callers may supply the
    // same canonical formula through the API/storage query contract.
    listExceptions: typeof query.listExceptions === 'string' && query.listExceptions.trim()
      ? query.listExceptions.trim()
      : null,
  };

  const entriesOriginal = Object.freeze(items.map((item) => Object.freeze({ ...item })));
  return {
    filters: Object.freeze(filters),
    entriesOriginal,
    entries: Object.freeze(entriesOriginal.map((item) => Object.freeze({ ...item }))),
  };
}

/**
 * Build the flattened runtime values owned by a SysBO entry page. `entryOriginal`
 * is the immutable baseline and `entry` is the working record. Both intentionally
 * have the same record shape so dirtiness is a direct structural comparison.
 */
export function pageEntryRuntimeContext(
  entry: Readonly<Record<string, unknown>>,
): ManatOSPageEntryRuntimeContext {
  const entryOriginal = Object.freeze({ ...entry });
  return {
    entryOriginal,
    // The working record always starts strictly from the finalized baseline,
    // for both create defaults and existing persisted data.
    entry: Object.freeze({ ...entryOriginal }),
  };
}

/**
 * Build an ID-keyed transactional workspace snapshot. Unlike entries, the
 * collection has no ordering semantics: each member is addressed by stable
 * entity identity (or later by a draft identity) and the whole graph can be
 * compared/committed as one logical unit.
 */
export function pageCollectionRuntimeContext(
  items: readonly Readonly<Record<string, unknown>>[],
): ManatOSPageCollectionRuntimeContext {
  const entriesOriginal = Object.freeze(items.map((item) => Object.freeze({ ...item })));
  const entries = Object.freeze(entriesOriginal.map((item) => Object.freeze({ ...item })));
  return { entriesOriginal, entries, selections: Object.freeze({}) };
}
