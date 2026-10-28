/**
 * UIS LIST SURFACE — owns query/paging/filter state, not child DOM composition.
 *
 * components/list/embedded declares Header, Filters, Views, Columns, Rows,
 * Cells, Pagination and Actions. UI adapters bind native controls to this
 * runtime's state transitions. The data/query runtime owns records and loading.
 * See: runtime/surface/embedded-runtime.ts for component lifecycle.
 */
import {
  ContextTreeRuntime,
  allSysBOMetadata,
  allSysBOUIMetadata,
  type ManatOSRuntimeRootContext,
} from '@manatos/shared';
import { createUiSemanticLayoutNode } from '../../runtime/layout/node.js';
import { uiListAvailableViews, uiListResolvedColumns, uiListFilterFields } from './ListMetadata.js';
import { EntityListRuntime } from './data/entity-list-runtime.js';
import { entityListQueryParams } from './data/entity-list-query.js';
import type {
  EntityListPage,
  EntityListDescriptor,
  EntityListQuery,
  EntityListSnapshot,
  EntityListSelectionMode,
} from './data/entity-list-contracts.js';
import type {
  UiRelatedRecords,
  UiSurfaceResourcePort,
} from '../../runtime/surface/resource-port.js';
export {
  uiListColumns,
  uiListAvailableViews,
  uiListFilterFields,
  type UiListFilterField,
  uiListEntityLabel,
  type UiListColumn,
} from './ListMetadata.js';
import {
  UiSurfaceEmbeddedRuntime,
  type UiEmbeddedSurfaceLevel,
} from '../../runtime/surface/embedded-runtime.js';
import { createListEmbeddedRegistry } from './embedded/registry.js';
import { UiEmbeddedEffectDispatcher } from '../../runtime/effect-dispatcher.js';
import { listPlacement, type ListEmbeddedDefinition, type UiListEffect } from './embedded/base.js';
import { createUiFieldBehavior } from '../fields/registry.js';
import type { UiFieldBehavior } from '../fields/field-types.js';
import type {
  UiEmbeddedInteractionEvent,
  UiEmbeddedDispatchResult,
} from '../../runtime/component.js';
import {
  UiHostLevelRuntime,
  type UiSurfaceContentContext,
} from '../../runtime/surface/host-level-runtime.js';
import { resolveUiSurfaceParentPath } from '../../runtime/surface/host-runtime.js';
import { createUiSurfaceInvocation } from '../../runtime/surface/invocation.js';

export interface UiListPageLevel {
  readonly control: {
    readonly host: 'page' | 'popup';
    readonly kind: 'list';
    readonly entityName: string;
    readonly instanceId: string;
    readonly invocation: ReturnType<typeof createUiSurfaceInvocation>;
  };
  readonly state: {
    readonly embeddedErrors: Record<string, string>;
    readonly list: {
      filtersVisible: boolean;
      filtersDocked: boolean;
      viewsOpen: boolean;
      view: string;
      page: number;
      pageSize: number;
      pageSizeOptions: readonly number[];
      total: number;
      totalPages: number;
      sort: string;
      direction: 'asc' | 'desc';
      loading: boolean;
      error: string | null;
      selectionMode: 'none' | 'single' | 'multiple';
      referencesError: string | null;
      referencesLoading: boolean;
    };
  };
  readonly layout: Record<string, unknown>;
  readonly data: {
    readonly list: Record<string, unknown>[];
    readonly filters: Record<string, string>;
    readonly references: UiRelatedRecords;
    readonly imageVariants: Readonly<Record<string, unknown>>;
    /** EJS0 List semantics; visible records retain their existing #data.list paths. */
    readonly listModel: {
      readonly definition: EntityListDescriptor | null;
      readonly query: EntityListQuery | null;
      readonly selectedIds: readonly string[];
      readonly paging: EntityListPage<Record<string, unknown>>['paging'];
      readonly pageSizeOptions: readonly number[];
    };
  };
}

let nextListPageId = 0;
/** List contributes only state/data. Every embedded component constructs its own layout. */
function initializeList(): Pick<UiListPageLevel, 'state' | 'data'> {
  return {
    state: {
      list: {
        filtersVisible: false,
        filtersDocked: false,
        viewsOpen: false,
        view: 'main',
        page: 1,
        pageSize: 10,
        pageSizeOptions: [2, 5, 10, 20, 50, 100],
        total: 0,
        totalPages: 0,
        sort: '',
        direction: 'asc',
        loading: false,
        error: null,
        selectionMode: 'none',
        referencesError: null,
        referencesLoading: false,
      },
      embeddedErrors: {},
    },
    data: {
      list: [],
      filters: { search: '' },
      references: {},
      imageVariants: {},
      listModel: {
        definition: null,
        query: null,
        selectedIds: [],
        paging: { total: 0, page: 1, pageSize: 10, totalPages: 0 },
        pageSizeOptions: [2, 5, 10, 20, 50, 100],
      },
    },
  };
}

/** Host-independent List behavior. The host already owns/publishes the canonical Surface.
 * This component owns only querying, state changes, and cancellation; no #level lifecycle.
 */
export class UiListContentRuntime {
  private rememberUserPageSize = false;
  private readonly queryRuntime: EntityListRuntime<Record<string, unknown>> | null;
  private requestVersion = 0;
  private disposed = false;
  constructor(
    private readonly host: UiSurfaceContentContext<UiListPageLevel>,
    entityKey: string,
    private readonly resourcePort?: UiSurfaceResourcePort,
    selectionMode: EntityListSelectionMode = 'none',
  ) {
    const columns = uiListResolvedColumns(entityKey, 'main');
    const entity = (
      allSysBOMetadata as unknown as Readonly<
        Record<
          string,
          {
            primaryField: string;
            entry?: { name?: { field?: string; expression?: string } };
            fieldDefinition: Readonly<Record<string, unknown>>;
          }
        >
      >
    )[entityKey];
    const source = resourcePort;
    let initialRequest = true;

    this.queryRuntime = source
      ? new EntityListRuntime({
          entityKey,
          idField: 'id',
          viewKey: 'main',
          columns: columns.map((column) => ({
            field: column.field,
            label: column.caption,
            sortable: column.sortable,
          })),
          selectionMode,
          initialQuery: {
            page: 1,
            pageSize: 10,
            direction: 'asc',
            filters: {},
            searchField:
              entity?.entry?.name &&
              'field' in entity.entry.name &&
              entity.entry.name.field &&
              Object.hasOwn(entity.fieldDefinition, entity.entry.name.field)
                ? entity.entry.name.field
                : entity?.primaryField,
          },
          dataSource: {
            load: async (query) => {
              const params = Object.fromEntries(entityListQueryParams(query).entries());
              if (initialRequest) {
                params['preferSavedPageSize'] = 'true';
                initialRequest = false;
              }
              if (this.rememberUserPageSize) {
                params['rememberPageSize'] = 'true';
                this.rememberUserPageSize = false;
              }
              return source.request<EntityListPage<Record<string, unknown>>>({
                kind: 'sysbo.list',
                entityKey,
                query: params,
              });
            },
          },
        })
      : null;
    if (this.queryRuntime) {
      this.publishModel(this.queryRuntime.snapshot);
      void this.loadQuery();
    }
  }
  get levelPath(): string {
    return this.host.levelPath;
  }
  get level(): UiListPageLevel {
    return this.host.level;
  }
  subscribe(listener: (level: UiListPageLevel) => void): () => void {
    return this.host.subscribe(listener, `${this.level.control.instanceId}:list-view`);
  }
  /** One atomic state update keeps floating List panels mutually exclusive. */
  setFiltersVisible(value: boolean): void {
    this.publishListState({ filtersVisible: value, ...(value ? { viewsOpen: false } : {}) });
  }
  setViewsOpen(value: boolean): void {
    this.publishListState({ viewsOpen: value, ...(value ? { filtersVisible: false } : {}) });
  }
  setFiltersDocked(value: boolean): void {
    this.publishListState({ filtersDocked: value, filtersVisible: true, viewsOpen: false });
  }
  /** One request owns the entire query result. Never publish stale rows or paging. */
  private async loadQuery(
    change?: (runtime: EntityListRuntime<Record<string, unknown>>) => Promise<unknown>,
  ): Promise<void> {
    const runtime = this.queryRuntime;
    if (!runtime || this.disposed) return;
    const request = ++this.requestVersion;
    // Calling change starts the host-neutral request synchronously and updates
    // its requested query before the first await. The old result is cleared there.
    const pending = change ? change(runtime) : runtime.load();
    const starting = runtime.snapshot;
    this.publishResourceSnapshot(starting, true, null);
    try {
      await pending;
      if (this.disposed || request !== this.requestVersion) return;
      // A popup selection may only reference a row still present in the current
      // authorized result. Refresh, paging, or filtering can invalidate it.
      const snapshot = runtime.snapshot;
      if (
        this.level.state.list.selectionMode === 'single' &&
        snapshot.selectedIds.some((id) => !snapshot.entries.some((row) => row['id'] === id))
      )
        runtime.clearSelection();
      this.publishResourceSnapshot(runtime.snapshot, false, null);
    } catch (error) {
      if (this.disposed || request !== this.requestVersion) return;
      if (this.level.state.list.selectionMode === 'single') runtime.clearSelection();
      this.publishResourceSnapshot(
        runtime.snapshot,
        false,
        error instanceof Error ? error.message : 'Unable to load records.',
      );
    }
  }

  /** Refresh in place with the current query; the mounted CTX/list session is retained. */
  refresh(): void {
    if (!this.disposed && !this.level.state.list.loading) void this.loadQuery();
  }

  private publishResourceSnapshot(
    snapshot: EntityListSnapshot<Record<string, unknown>>,
    loading: boolean,
    error: string | null,
  ): void {
    const state = {
      ...this.level.state,
      list: {
        ...this.level.state.list,
        loading,
        error,
        referencesError: null,
        referencesLoading: false,
        page: snapshot.paging.page,
        pageSize: snapshot.paging.pageSize,
        pageSizeOptions: snapshot.pageSizeOptions,
        total: snapshot.paging.total,
        totalPages: snapshot.paging.totalPages,
        sort: snapshot.query.sort ?? '',
        direction: snapshot.query.direction,
      },
    };
    const data = {
      ...this.level.data,
      list: [...snapshot.entries],
      references: snapshot.references,
      imageVariants: snapshot.imageVariants,
      listModel: {
        definition: snapshot.definition,
        query: snapshot.query,
        selectedIds: snapshot.selectedIds,
        paging: snapshot.paging,
        pageSizeOptions: snapshot.pageSizeOptions,
      },
    };
    this.host.publish(state, data);
  }

  /** Project the existing EntityListRuntime snapshot; do not create a second List engine. */
  private publishModel(snapshot: EntityListSnapshot<Record<string, unknown>>): void {
    this.host.set('data.listModel', {
      definition: snapshot.definition,
      query: snapshot.query,
      selectedIds: snapshot.selectedIds,
      paging: snapshot.paging,
      pageSizeOptions: snapshot.pageSizeOptions,
    });
  }

  /** Selection is content state, shared by Page and future Popup hosts. */
  select(id: string): void {
    if (!this.queryRuntime || !id) return;
    this.queryRuntime.select(id);
    this.publishModel(this.queryRuntime.snapshot);
  }
  deselect(id: string): void {
    if (!this.queryRuntime) return;
    this.queryRuntime.deselect(id);
    this.publishModel(this.queryRuntime.snapshot);
  }
  clearSelection(): void {
    if (!this.queryRuntime) return;
    this.queryRuntime.clearSelection();
    this.publishModel(this.queryRuntime.snapshot);
  }

  private publishListState(change: Partial<UiListPageLevel['state']['list']>): void {
    if (this.disposed) return;
    this.host.set('state.list', { ...this.level.state.list, ...change });
  }
  setPage(page: number): void {
    if (
      Number.isSafeInteger(page) &&
      page > 0 &&
      page <= Math.max(1, this.level.state.list.totalPages)
    )
      void this.loadQuery((engine) => engine.setPage(page));
  }
  setPageSize(size: number): void {
    if (this.level.state.list.pageSizeOptions.includes(size)) {
      this.rememberUserPageSize = true;
      void this.loadQuery((engine) => engine.setQuery({ page: 1, pageSize: size }));
    }
  }
  setSort(field: string): void {
    const entity = String(this.level.control.invocation.params['entityKey']);
    const columns = uiListResolvedColumns(entity, this.level.state.list.view);
    if (!columns.some((column) => column.field === field && column.sortable)) return;
    const previous = this.level.state.list;
    const direction = previous.sort === field && previous.direction === 'asc' ? 'desc' : 'asc';
    void this.loadQuery((engine) => engine.setSort(field, direction));
  }
  setView(key: string): void {
    const entityKey = String(this.level.control.invocation.params['entityKey'] ?? '');
    if (!uiListAvailableViews(entityKey, 'EN').some((view) => view.key === key)) return;
    if (this.level.state.list.view !== key) {
      // Component-owned reconciliations observe this one canonical state change.
      this.host.set('state.list.view', key);
      const columns = uiListResolvedColumns(entityKey, key);
      if (this.queryRuntime) {
        void this.queryRuntime.setView(
          key,
          columns.map((column) => ({
            field: column.field,
            label: column.caption,
            sortable: column.sortable,
            filterable: column.filterable,
          })),
        );
        this.publishModel(this.queryRuntime.snapshot);
      }
    }
    this.setViewsOpen(false);
  }
  setSearch(value: string): void {
    if (this.level.data.filters.search !== value) {
      this.host.set('data.filters.search', value);
      if (this.queryRuntime) void this.loadQuery((engine) => engine.setSearch(value));
    }
  }
  setFilter(name: string, value: string): void {
    const entity = String(this.level.control.invocation.params['entityKey']);
    const allowed = uiListFilterFields(entity, 'EN', this.level.state.list.view);
    if (!allowed.some((field) => field.field === name) || value.length > 512) return;
    if (this.level.data.filters[name] !== value) {
      this.host.set(`data.filters.${name}`, value);
      if (this.queryRuntime) void this.loadQuery((engine) => engine.setFilter(name, value));
    }
  }
  dispose(): void {
    this.disposed = true;
    this.requestVersion++;
  }
}

export class UiListPageRuntime {
  readonly instanceId = `list-page-${++nextListPageId}`;
  private readonly host: UiHostLevelRuntime<UiListPageLevel>;
  private readonly embedded: UiSurfaceEmbeddedRuntime;
  readonly content: UiListContentRuntime;
  private readonly effectDispatcher: UiEmbeddedEffectDispatcher<UiListEffect>;
  readonly levelPath: string;
  /** A List owns its prepared read-only formatters, not the header or an individual row. */
  private readonly fieldBehaviors = new Map<string, UiFieldBehavior>();
  private readonly fieldEntityKey: string;

  constructor(
    context: ContextTreeRuntime<ManatOSRuntimeRootContext>,
    entityKey: string,
    resourcePort?: UiSurfaceResourcePort,
    options: {
      host?: 'page' | 'popup';
      parentLevelPath?: string | null;
      selectionMode?: EntityListSelectionMode;
    } = {},
  ) {
    this.fieldEntityKey = entityKey;
    const hostKind = options.host ?? 'page';
    this.levelPath =
      hostKind === 'page' && !options.parentLevelPath
        ? 'ctx.ui.level'
        : `${resolveUiSurfaceParentPath(context, options.parentLevelPath ?? null)}.level`;
    if (!/^[a-z][a-z0-9-]*$/.test(entityKey) || !Object.hasOwn(allSysBOUIMetadata, entityKey))
      throw new Error('Invalid List entity key.');
    let draft: UiEmbeddedSurfaceLevel | null = null;
    let embedded: UiSurfaceEmbeddedRuntime | null = null;
    let createdHost: UiHostLevelRuntime<UiListPageLevel> | null = null;
    let ownedContent: UiListContentRuntime | null = null;
    try {
      createdHost = new UiHostLevelRuntime<UiListPageLevel>(
        context,
        {
          host: hostKind,
          kind: 'list',
          entityName:
            (allSysBOMetadata as unknown as Readonly<Record<string, { pluralLabel?: string }>>)[
              entityKey
            ]?.pluralLabel ?? entityKey,
          instanceId: this.instanceId,
          invocation: createUiSurfaceInvocation({
            params: {
              entityKey,
              view: 'main',
              selectionMode: options.selectionMode ?? 'none',
              showControls: true,
            },
          }),
        },
        () => {
          const initial = initializeList();
          const contents = {
            ...initial,
            state: {
              ...initial.state,
              list: { ...initial.state.list, selectionMode: options.selectionMode ?? 'none' },
            },
          };
          draft = contents as unknown as UiEmbeddedSurfaceLevel;
          embedded = new UiSurfaceEmbeddedRuntime(
            context,
            this.levelPath,
            createListEmbeddedRegistry(),
            {
              name: this.instanceId,
              draft: () => draft,
              errorsPath: 'state.embeddedErrors',
              node: (kind, id, selector, field) =>
                createUiSemanticLayoutNode(kind, id, `list:${id}`, selector, {}, field),
              componentNode: (definition) =>
                createUiSemanticLayoutNode(
                  'component',
                  definition.id,
                  `list:${definition.id}`,
                  (definition as ListEmbeddedDefinition).selector,
                  {},
                  undefined,
                  true,
                ),
            },
          );
          const root = createUiSemanticLayoutNode('root', 'layout', 'list:layout', '');
          root.List = embedded.mount(
            listPlacement('List', 'list', '[data-list-layout="List"]', entityKey, {
              showActions: hostKind === 'popup',
            }),
            `${this.levelPath}.layout.List`,
          );
          return { ...contents, layout: root };
        },
        () => {
          (ownedContent as UiListContentRuntime | null)?.dispose();
          (embedded as UiSurfaceEmbeddedRuntime | null)?.dispose();
        },
        options.parentLevelPath ?? null,
      );
      if (!embedded) throw new Error('List embedded runtime was not initialized.');
      this.host = createdHost;
      this.embedded = embedded as UiSurfaceEmbeddedRuntime;
      this.embedded.attach();
      this.content = new UiListContentRuntime(
        createdHost,
        entityKey,
        resourcePort,
        options.selectionMode ?? 'none',
      );
      // The Surface alone commits intents; each registered component owns interpretation.
      // New effects require an explicit handler, never an enlarged switch in this Host.
      this.effectDispatcher = new UiEmbeddedEffectDispatcher<UiListEffect>()
        .register('refresh-list', () => this.content.refresh())
        .register('filters-visible', (effect) => this.content.setFiltersVisible(effect.value))
        .register('filters-docked', (effect) => this.content.setFiltersDocked(effect.value))
        .register('views-open', (effect) => this.content.setViewsOpen(effect.value))
        .register('set-filter', (effect) => this.content.setFilter(effect.field, effect.value))
        .register('set-search', (effect) => this.content.setSearch(effect.value))
        .register('set-view', (effect) => this.content.setView(effect.value))
        .register('set-sort', (effect) => this.content.setSort(effect.value))
        .register('set-page', (effect) => this.content.setPage(effect.value))
        .register('set-page-size', (effect) => this.content.setPageSize(effect.value));
      ownedContent = this.content;
      draft = null;
    } catch (error) {
      (embedded as UiSurfaceEmbeddedRuntime | null)?.dispose();
      try {
        createdHost?.dispose();
      } catch {
        /* preserve initialization failure */
      }
      throw error;
    }
  }
  get level(): UiListPageLevel {
    return this.content.level;
  }
  subscribe(listener: (level: UiListPageLevel) => void): () => void {
    return this.content.subscribe(listener);
  }
  /** Formatting is a registered Field service; headings have no ownership over cells. */
  fieldBehaviorForColumn(index: number): UiFieldBehavior | undefined {
    const column = uiListResolvedColumns(this.fieldEntityKey, this.level.state.list.view)[index];
    if (!column) return undefined;
    let behavior = this.fieldBehaviors.get(column.field);
    if (!behavior) {
      behavior = createUiFieldBehavior(this.fieldEntityKey, column.field);
      this.fieldBehaviors.set(column.field, behavior);
    }
    return behavior;
  }
  /**
   * An event starts at its registered List component, then traverses the
   * semantic component hierarchy before reaching the host. Target identity is
   * cached while mounted; dynamic replacement invalidates retired owners.
   */
  private readonly eventPaths = new Map<string, string>();
  dispatchInteraction(
    kind: string,
    event: UiEmbeddedInteractionEvent,
    field?: string,
  ): UiEmbeddedDispatchResult {
    const empty: UiEmbeddedDispatchResult = {
      handled: false,
      consumed: false,
      preventDefault: false,
      effects: [],
    };
    const key = `${kind}\u0000${field ?? ''}`;
    let path = this.eventPaths.get(key);
    const matches = (definition: { readonly kind: string }): boolean =>
      definition.kind === kind &&
      (!field || (definition as ListEmbeddedDefinition).field === field);
    if (!path || !this.embedded.definitionAt(path) || !matches(this.embedded.definitionAt(path)!)) {
      path = this.embedded.findComponentPath(matches) ?? undefined;
      if (!path) return empty;
      this.eventPaths.set(key, path);
    }
    const result = this.embedded.dispatchEvent(path, event);
    this.applyEffects(result.effects);
    return result;
  }

  /** Legacy native callsites share direct-owner routing; no kind dispatch scan. */
  dispatchAction(kind: string, action: string, field?: string): void {
    this.dispatchInteraction(kind, { type: 'action', action, ...(field ? { field } : {}) }, field);
  }

  dispatchControl(kind: string, value: string, field?: string): void {
    this.dispatchInteraction(
      kind,
      {
        type: 'control-input',
        control: 'text',
        value,
        ...(field ? { field } : {}),
      },
      field,
    );
  }

  private applyEffects(effects: readonly { type: string }[]): void {
    this.effectDispatcher.dispatch(effects as readonly UiListEffect[]);
  }

  refresh(): void {
    this.content.refresh();
  }
  setFiltersVisible(value: boolean): void {
    this.content.setFiltersVisible(value);
  }
  setViewsOpen(value: boolean): void {
    this.content.setViewsOpen(value);
  }
  setFiltersDocked(value: boolean): void {
    this.content.setFiltersDocked(value);
  }
  /** A popup may select only an actual, currently loaded record. */
  selectRow(id: string): boolean {
    if (this.level.state.list.selectionMode === 'none' || this.level.state.list.loading)
      return false;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return false;
    if (!this.level.data.list.some((row) => String(row.id ?? '') === id)) return false;
    this.content.select(id);
    return true;
  }
  select(id: string): void {
    this.selectRow(id);
  }
  deselect(id: string): void {
    this.content.deselect(id);
  }
  clearSelection(): void {
    this.content.clearSelection();
  }
  setPage(page: number): void {
    this.content.setPage(page);
  }
  setPageSize(size: number): void {
    this.content.setPageSize(size);
  }
  setSort(field: string): void {
    this.content.setSort(field);
  }
  setView(key: string): void {
    this.content.setView(key);
  }
  setSearch(value: string): void {
    this.content.setSearch(value);
  }
  setFilter(name: string, value: string): void {
    this.content.setFilter(name, value);
  }
  dispose(): void {
    this.fieldBehaviors.clear();
    this.host.dispose();
  }
}
