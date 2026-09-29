import type { SysBOUIRecordTabMetadata } from './types.js';
/**
 * Framework-neutral SysBO UI metadata registry used by the metadata-driven
 * administration renderer.
 *
 * This registry is the authoritative presentation contract for generic SysBO
 * administration pages. Concrete renderers consume these semantic declarations;
 * EJS partial names, Bootstrap classes and browser-only details do not belong here.
 *
 * Specialized workflows are expressed through reusable component keys/options/
 * bindings rather than entity-specific branches in the generic page renderer.
 */
type TabOptions = Partial<
  Pick<
    SysBOUIRecordTabMetadata,
    | 'icon'
    | 'layout'
    | 'representation'
    | 'visible'
    | 'component'
    | 'content'
    | 'readOnly'
    | 'navigationTrack'
  >
>;

/** Flatten canonical field/collection dependencies declared by ordered tab content. */
export const tabContentKeys = (
  content: readonly import('./types.js').SysBOUITabContentMetadata[] | undefined,
): string[] =>
  (content ?? []).flatMap((item) => {
    if (item.kind === 'field') return [item.field, ...(item.relatedFields ?? [])];
    if (item.kind === 'collection') return [item.collection];
    if (item.kind === 'column' || item.kind === 'inline') return tabContentKeys(item.content);
    if (item.kind === 'component') {
      return Object.entries(item.component.options ?? {}).flatMap(([key, value]) =>
        key.endsWith('Field') && typeof value === 'string' ? [value] : [],
      );
    }
    return [];
  });

/**
 * Declare one metadata-driven tab. Ordered `content` is the sole declaration of
 * tab membership/order.
 */
export const tab = (
  id: string,
  label: string,
  order: number,
  options: TabOptions = {},
): SysBOUIRecordTabMetadata => ({
  id,
  label,
  order,
  navigationTrack: { statePath: 'activeTabId' },
  ...options,
});

/**
 * Developer-only debugging surface contributed to effective entry UI metadata.
 *
 * The canonical business/entity metadata stays free of development tooling.
 * When developer mode is active the UI composition layer appends this ordinary
 * metadata tab. From that point onward renderers/navigation treat Debugging like
 * any other metadata-declared tab; no template may synthesize a parallel tab.
 */
export const debuggingTab = (): SysBOUIRecordTabMetadata =>
  tab('debugging', 'Debugging', Number.MAX_SAFE_INTEGER, {
    icon: 'bug',
    layout: 'debug-calculations',
    readOnly: true,
    component: {
      key: 'debugging-panel',
      readOnly: true,
      options: {
        sections: [
          {
            id: 'cli',
            label: 'CLI',
            navigationTrack: {
              statePath: 'activeInternalTabIds.debugging',
            },
          },
          {
            id: 'entity',
            label: 'Entity',
            navigationTrack: {
              statePath: 'activeInternalTabIds.debugging',
            },
          },
          {
            id: 'ui',
            label: 'UI',
            navigationTrack: {
              statePath: 'activeInternalTabIds.debugging',
            },
          },
        ],
      },
    },
  });

/**
 * Build effective record tabs for the current runtime mode.
 *
 * This is augmentation, not business metadata mutation: developer-only UI is
 * injected only into the effective presentation contract consumed by the page
 * or popup. The returned array is safe for every metadata-driven entry host.
 */
export const effectiveRecordTabs = (
  tabs: readonly SysBOUIRecordTabMetadata[],
  developerMode: boolean,
): readonly SysBOUIRecordTabMetadata[] =>
  developerMode && !tabs.some((candidate) => candidate.id === 'debugging')
    ? [...tabs, debuggingTab()]
    : [...tabs];

export const generalTab = (content: readonly import('./types.js').SysBOUITabContentMetadata[]) =>
  tab('general', 'General', 10, {
    icon: 'info-circle',
    layout: 'form',
    content,
  });

export const standardAddAction = (label = 'Add new') =>
  ({
    visible: { expression: 'permissions.create === true' },
    enabled: true,
    label,
  }) as const;

/** Standard icon-only row action for opening an entity's declared read-only quickView. */
export const standardQuickViewAction = (entityKey: string) => ({
  kind: 'open-entry' as const,
  order: 10,
  visible: true,
  placement: 'start' as const,
  label: 'Quick view',
  icon: 'eye',
  iconOnly: true,
  tone: 'secondary' as const,
  emphasis: 'outline' as const,
  title: 'Quick view',
  href: '/bo/' + entityKey + '/{id}',
  mode: 'view' as const,
  uiView: 'quickView',
});

export const standardEntryActions = {
  delete: {
    kind: 'delete' as const,
    order: 20,
    visible: { expression: "mode !== 'create' && permissions.delete === true" },
    placement: 'footer-leading' as const,
    label: 'Delete entry',
    icon: 'trash',
    tone: 'danger' as const,
  },
  save: {
    kind: 'save' as const,
    order: 100,
    visible: {
      expression: "mode !== 'view' && (permissions.create === true || permissions.update === true)",
    },
    placement: 'footer-trailing' as const,
    label: 'Save',
    icon: 'check-circle',
    tone: 'primary' as const,
  },
} as const;

export const systemTab = (): SysBOUIRecordTabMetadata =>
  tab('system', 'System details', 900, {
    icon: 'clock-history',
    layout: 'summary',
    content: ['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'].map((field) => ({
      kind: 'field' as const,
      field,
    })),
  });

export const systemFieldOverrides = {
  createdAt: {
    presentation: { mode: 'summary' as const, format: 'datetime-elapsed' as const, emptyText: '—' },
  },
  createdBy: {
    // Actor/user names are presentation semantics, not entity-specific logic.
    // Every metadata-driven System details summary therefore gets the same
    // compact read-only name treatment through the shared summary renderer.
    presentation: { mode: 'summary' as const, format: 'name' as const, emptyText: '—' },
  },
  updatedAt: {
    presentation: { mode: 'summary' as const, format: 'datetime-elapsed' as const, emptyText: '—' },
  },
  updatedBy: {
    presentation: { mode: 'summary' as const, format: 'name' as const, emptyText: '—' },
  },
} as const;

export const relatedLicensesCollection = (filterField: 'principalId' | 'applicationId') => ({
  label: 'Licenses',
  icon: 'key',
  rowIcon: 'key',
  entityKey: 'sys-licenses',
  source: {
    kind: 'entity-query' as const,
    filterField,
    currentField: 'id',
    pageSize: 100,
    sort: 'name',
    direction: 'asc' as const,
  },
  relatedListView: 'default',
  relatedListViews: {
    default: {
      layout: 'table-list' as const,
      rowIcon: 'key',
      rowHref: '/bo/sys-licenses/{id}',
      emptyText: 'No related licenses.',
      fields: {
        name: {},
        ...(filterField === 'principalId'
          ? { applicationId: { label: 'Application' } }
          : { principalId: { label: 'Customer' } }),
        platformId: {},
        status: {},
        validUntil: {},
        enabled: {},
      },
    },
  },
});
