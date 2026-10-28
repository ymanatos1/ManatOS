import {
  ContextTreeRuntime,
  ExpressionEvaluationError,
  ExpressionParseError,
  MANATOS_COMPANY,
  evaluateExpression,
  resolvePlatform,
  resolveMetadataText,
  type MetadataLanguage,
  type NavigationContribution,
  type NavigationMenuEntry,
  type NavigationReference,
  type ExpressionDiagnosticSink,
  type ManatOSRuntimeRootContext,
  type SysPlatform,
} from '@manatos/shared';

export interface UiNavigationItem {
  id: string;
  label: string;
  icon?: string;
  tooltip?: string;
  /** Canonical entity target, distinct from an incidental access dependency. */
  entityKey?: string;
  url?: string;
  action?: string;
  order: number;
  separatorBefore: boolean;
  dockBottom: boolean;
  children: readonly UiNavigationItem[];
}

/**
 * Framework-neutral navigation link policy. Semantic commands and external URLs
 * do not become ordinary in-application links.
 */
export function workspaceNavigationHref(item: UiNavigationItem): string | null {
  if (!item.url || item.action || item.id === 'logout') return null;
  try {
    const target = new URL(item.url, 'https://manatos.invalid');
    if (target.origin !== 'https://manatos.invalid') return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

/**
 * Resolve the active workspace destination independently of a browser router.
 * Nested Entry paths retain their List link. The longest matching *segment*
 * wins, so /bo/sys-users-old cannot activate /bo/sys-users.
 */
export function activeWorkspaceNavigationItemId(
  items: readonly UiNavigationItem[],
  pathname: string,
): string | null {
  const currentPath = pathname.split(/[?#]/, 1)[0]!.replace(/\/+$/, '') || '/';
  let bestId: string | null = null;
  let bestLength = -1;

  const visit = (entries: readonly UiNavigationItem[]): void => {
    for (const item of entries) {
      const href = workspaceNavigationHref(item);
      if (href !== null) {
        const targetPath = href.split(/[?#]/, 1)[0]!.replace(/\/+$/, '') || '/';
        const matches =
          targetPath === '/'
            ? currentPath === '/'
            : currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
        if (matches && targetPath.length > bestLength) {
          bestId = item.id;
          bestLength = targetPath.length;
        }
      }
      visit(item.children);
    }
  };
  visit(items);
  return bestId;
}

export interface UiNavigationState {
  readonly platform: UiNavigationItem | null;
  readonly primary: readonly UiNavigationItem[];
  readonly workspace: readonly UiNavigationItem[];
}

function isReference(entry: NavigationMenuEntry): entry is NavigationReference {
  return 'navigationId' in entry;
}

function catalogueFor(platform: SysPlatform | null): ReadonlyMap<string, NavigationContribution> {
  return new Map(
    [...MANATOS_COMPANY.navigation, ...(platform?.navigation ?? [])].map((contribution) => [
      contribution.id,
      contribution,
    ]),
  );
}

function resolveContribution(
  entry: NavigationMenuEntry,
  catalogue: ReadonlyMap<string, NavigationContribution>,
): NavigationContribution {
  if (!isReference(entry)) {
    return entry;
  }

  const contribution = catalogue.get(entry.navigationId);

  if (!contribution) {
    throw new Error(`Navigation reference '${entry.navigationId}' was not found.`);
  }

  return entry.order === undefined ? contribution : { ...contribution, order: entry.order };
}

function evaluateVisible(
  contribution: NavigationContribution,
  context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
  diagnosticSink?: ExpressionDiagnosticSink,
): boolean {
  if (contribution.visible === undefined) {
    return true;
  }

  if (typeof contribution.visible === 'boolean') {
    return contribution.visible;
  }

  const caller = {
    source: 'navigation' as const,
    sourcePath: `navigation.${contribution.id}.visible`,
    purpose: 'Navigation visibility',
  };

  try {
    const value = evaluateExpression(
      contribution.visible.expression,
      context.root(),
      context.root(),
      caller,
      diagnosticSink
        ? {
            diagnosticSink: (diagnostic) =>
              diagnosticSink({ ...diagnostic, caller: diagnostic.caller ?? caller }),
          }
        : {},
    );

    return value === true;
  } catch (error) {
    if (error instanceof ExpressionParseError || error instanceof ExpressionEvaluationError) {
      return false;
    }
    throw error;
  }
}

function isAvailable(
  contribution: NavigationContribution,
  effectiveKeys: ReadonlySet<string>,
  context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
  diagnosticSink?: ExpressionDiagnosticSink,
  entityCapabilities: Readonly<Record<string, Readonly<Record<string, boolean>>>> = {},
): boolean {
  if (contribution.entityKey && !effectiveKeys.has(contribution.entityKey)) return false;
  if (
    contribution.requiresEntityKeys?.some((entityKey) => !effectiveKeys.has(entityKey)) === true
  ) {
    return false;
  }

  // Existence in the entity catalogue is not authorization to read it.
  const readEntity = contribution.entityKey ?? contribution.requiresEntityRead;
  if (readEntity && entityCapabilities[readEntity]?.read !== true) return false;

  return evaluateVisible(contribution, context, diagnosticSink);
}

function platformPrimaryNavigationItem(language: MetadataLanguage): UiNavigationItem | null {
  const enabledPlatforms = MANATOS_COMPANY.platforms.filter((candidate) => candidate.enabled);
  if (!enabledPlatforms.length) return null;

  if (enabledPlatforms.length === 1) {
    const platform = enabledPlatforms[0]!;

    return {
      id: 'platform',
      label: '@CM.Platform',
      icon: platform.icon ?? 'bi-boxes',
      tooltip:
        language === 'EL'
          ? `Άνοιγμα της πλατφόρμας ${resolveMetadataText(platform.shortName, language)}`
          : `Open the ${resolveMetadataText(platform.shortName, language)} platform`,
      url: `/platform/${encodeURIComponent(platform.id)}`,
      order: 300,
      separatorBefore: false,
      dockBottom: false,
      children: [],
    };
  }

  return {
    id: 'platform',
    label: '@CM.Platform',
    icon: 'bi-boxes',
    tooltip: '@CM.OpenPlatformPage',
    order: 300,
    separatorBefore: false,
    dockBottom: false,
    children: enabledPlatforms.map((platform, index) => ({
      id: `platform-${platform.id}`,
      label: platform.shortName,
      icon: platform.icon ?? 'bi-boxes',
      tooltip:
        language === 'EL'
          ? `Άνοιγμα της πλατφόρμας ${resolveMetadataText(platform.shortName, language)}`
          : `Open the ${resolveMetadataText(platform.shortName, language)} platform`,
      url: `/platform/${encodeURIComponent(platform.id)}`,
      order: index,
      separatorBefore: false,
      dockBottom: false,
      children: [],
    })),
  };
}

function projectMenu(
  entries: readonly NavigationMenuEntry[],
  catalogue: ReadonlyMap<string, NavigationContribution>,
  effectiveKeys: ReadonlySet<string>,
  context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
  diagnosticSink?: ExpressionDiagnosticSink,
  entityCapabilities: Readonly<Record<string, Readonly<Record<string, boolean>>>> = {},
): readonly UiNavigationItem[] {
  const selected = entries
    .map((entry) => resolveContribution(entry, catalogue))
    .filter(
      (contribution, index, all) =>
        all.findIndex((candidate) => candidate.id === contribution.id) === index,
    )
    .sort((left, right) => left.order - right.order);

  const selectedById = new Map(selected.map((contribution) => [contribution.id, contribution]));

  const availableIds = new Set(
    selected
      .filter((contribution) =>
        isAvailable(contribution, effectiveKeys, context, diagnosticSink, entityCapabilities),
      )
      .map((contribution) => contribution.id),
  );

  const ids = new Set<string>();

  // Never promote a denied parent just because one of its children is visible.
  // An unselected parent is not part of this menu and leaves its child at root.
  const includeWithAncestors = (
    contribution: NavigationContribution,
    visiting: Set<string> = new Set(),
  ): boolean => {
    if (!availableIds.has(contribution.id) || visiting.has(contribution.id)) return false;
    if (ids.has(contribution.id)) return true;

    visiting.add(contribution.id);
    const parent = contribution.parentId ? selectedById.get(contribution.parentId) : undefined;
    const allowed = !parent || includeWithAncestors(parent, visiting);
    visiting.delete(contribution.id);

    if (!allowed) return false;
    ids.add(contribution.id);
    return true;
  };

  for (const contribution of selected) {
    includeWithAncestors(contribution);
  }

  const contributions = selected.filter((contribution) => ids.has(contribution.id));

  const build = (contribution: NavigationContribution): UiNavigationItem => {
    const available = availableIds.has(contribution.id);

    return {
      id: contribution.id,
      label: contribution.text,
      ...(contribution.icon ? { icon: contribution.icon } : {}),
      ...(contribution.tooltip ? { tooltip: contribution.tooltip } : {}),
      ...(contribution.entityKey ? { entityKey: contribution.entityKey } : {}),
      ...(available && contribution.entityKey
        ? { url: `/bo/${encodeURIComponent(contribution.entityKey)}` }
        : available && contribution.url
          ? { url: contribution.url }
          : {}),
      ...(available && contribution.action ? { action: contribution.action } : {}),
      order: contribution.order,
      separatorBefore: contribution.separatorBefore === true,
      dockBottom: contribution.dockBottom === true,
      children: contributions
        .filter((candidate) => candidate.parentId === contribution.id)
        .sort((left, right) => left.order - right.order)
        .map(build),
    };
  };

  return contributions
    .filter(
      (contribution) => contribution.parentId === undefined || !ids.has(contribution.parentId),
    )
    .sort((left, right) => left.order - right.order)
    .map(build);
}

/** Display-only localization. Canonical navigation and CTX always retain @ references. */
function localizeNavigationItem(
  item: UiNavigationItem,
  language: MetadataLanguage,
): UiNavigationItem {
  return {
    ...item,
    label: resolveMetadataText(item.label, language),
    ...(item.tooltip === undefined ? {} : { tooltip: resolveMetadataText(item.tooltip, language) }),
    children: item.children.map((child) => localizeNavigationItem(child, language)),
  };
}

export function createUiNavigationState(
  context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
  diagnosticSink?: ExpressionDiagnosticSink,
  entityCapabilities: Readonly<Record<string, Readonly<Record<string, boolean>>>> = {},
  language: MetadataLanguage = 'EN',
): UiNavigationState {
  const platformId = context.get('ctx.company.currentPlatform');
  if (platformId !== null && typeof platformId !== 'string') {
    throw new Error('CTX company.currentPlatform must be a platform id or null.');
  }

  const platform = platformId === null ? null : resolvePlatform(MANATOS_COMPANY, platformId);
  const catalogue = catalogueFor(platform);
  const runtimeEntities = context.get('ctx.runtime.entities');
  if (!runtimeEntities || typeof runtimeEntities !== 'object' || Array.isArray(runtimeEntities)) {
    throw new Error('CTX runtime.entities is required for navigation projection.');
  }
  const effectiveKeys = new Set(
    Object.values(runtimeEntities as Record<string, { key?: unknown }>)
      .map((entity) => entity?.key)
      .filter((key): key is string => typeof key === 'string' && key.length > 0),
  );

  const platformNavigation =
    platform?.platformNavigation === undefined
      ? null
      : (projectMenu(
          [platform.platformNavigation],
          catalogue,
          effectiveKeys,
          context,
          diagnosticSink,
          entityCapabilities,
        )[0] ?? null);

  const primary = projectMenu(
    [...MANATOS_COMPANY.primaryNavigation, ...(platform?.primaryNavigation ?? [])],
    catalogue,
    effectiveKeys,
    context,
    diagnosticSink,
    entityCapabilities,
  ).filter((item) => item.id !== 'platform');

  const platformPrimary = platformPrimaryNavigationItem(language);
  const primaryWithPlatform = platformPrimary ? [...primary, platformPrimary] : primary;

  return {
    platform: platformNavigation ? localizeNavigationItem(platformNavigation, language) : null,

    primary: primaryWithPlatform
      .sort((left, right) => left.order - right.order)
      .map((item) => localizeNavigationItem(item, language)),

    workspace: projectMenu(
      [...MANATOS_COMPANY.workspaceNavigation, ...(platform?.workspaceNavigation ?? [])],
      catalogue,
      effectiveKeys,
      context,
      diagnosticSink,
      entityCapabilities,
    ).map((item) => localizeNavigationItem(item, language)),
  };
}
