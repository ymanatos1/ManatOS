import {
  type CompanyInfo,
  type ManatOSCompanyContext,
  type ManatOSContext,
  type ManatOSContextField,
  type ManatOSContextFields,
  type ManatOSEntityContext,
  type ManatOSPageContextNode,
  type ManatOSUserContext,
  type SysBOUser,
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

export function contextField<T>(value: T): ManatOSContextField<T> {
  return { value };
}

/** Build a keyed runtime field collection. The key itself is the field name. */
export function contextFields(
  values: Readonly<Record<string, unknown>>,
): ManatOSContextFields {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      assertContextIdentifier(key, 'field'),
      contextField(value),
    ]),
  );
}

function userContext(user: SysBOUser | null): ManatOSUserContext | null {
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
    entityName: entityContextName('sys-users'),
    fields,
  };
}

/** Build the safe root context that exists for every UI request. */
export function createManatOSContext(
  company: CompanyInfo,
  currentPlatform: SysPlatform,
  apiBaseUrl: string,
  clientVersion: string,
  user: SysBOUser | null = null,
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
    entities: {},
    company: companyContext,
    user: userContext(user),
    server: Object.freeze({ apiBaseUrl }),
    client: Object.freeze({ kind: 'web-ejs', version: clientVersion }),
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
function withCompiledExpressions(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => withCompiledExpressions(item));
  }
  if (!value || typeof value !== 'object') return value;

  const source = value as Record<string, unknown>;
  const copy: Record<string, unknown> = Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => key !== 'ast')
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
    ...(metadata !== undefined ? { metadata: withCompiledExpressions(metadata) } : {}),
    ...(uiMetadata !== undefined ? { uiMetadata: withCompiledExpressions(uiMetadata) } : {}),
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

export function pageContextNode(
  name: string,
  kind: string,
  mode: string,
  fields: ManatOSContextFields = {},
  page: ManatOSPageContextNode | null = null,
): ManatOSPageContextNode {
  return {
    name: assertContextIdentifier(name, 'page'),
    kind,
    mode,
    fields,
    page,
  };
}
