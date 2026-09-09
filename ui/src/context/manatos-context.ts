import {
  type CompanyInfo,
  type ManatOSCompanyContext,
  type ManatOSContext,
  type ManatOSContextField,
  type ManatOSContextFields,
  type ManatOSEntityContext,
  type ManatOSUserContext,
  type SysBOUser,
  type SysBOFieldMetadata,
  sysBOUsersMetadata,
  calculatedContextField,
  contextPointer,
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
    .map((part, index) => (index === 0 ? part : `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`))
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
    const options = Object.freeze(
      (referenceOptions ?? []).map((option) => Object.freeze({ ...option })),
    );
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
  const { passwordHash, ...safeUser } = user;
  void passwordHash;
  const fields = contextFields(safeUser);
  for (const [fieldName, field] of Object.entries(sysBOUsersMetadata.fieldDefinition)) {
    const calculation = field.calculation;
    if (!calculation?.expression || calculation.triggeredBy?.length) continue;
    fields[fieldName] = calculatedContextField(calculation.expression, {
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
  };
}

/**
 * Copy canonical metadata into ctx.entities without adding runtime-local
 * compiler artefacts. Expression source is the portable contract; each
 * execution host compiles and caches its own AST when it actually evaluates or
 * inspects the expression.
 *
 * The outer ctx.entities key already owns entity identity, so the copied root
 * metadata object omits its duplicate `key` property.
 */
function contextMetadata(value: unknown, omitOwnKey = false): unknown {
  if (Array.isArray(value)) return value.map((item) => contextMetadata(item));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'ast' && !(omitOwnKey && key === 'key'))
      .map(([key, child]) => [key, contextMetadata(child)]),
  );
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
    ...(metadata !== undefined ? { metadata: contextMetadata(metadata, true) } : {}),
    ...(uiMetadata !== undefined ? { uiMetadata: contextMetadata(uiMetadata, true) } : {}),
  };
  ctx.entities[name] = entity;
  return entity;
}
