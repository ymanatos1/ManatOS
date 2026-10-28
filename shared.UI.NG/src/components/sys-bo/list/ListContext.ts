import { Injectable, inject, computed, signal } from '@angular/core';
import { NgUiSurfaceManager } from '../../../runtime/surfaces/uiSurfaceManager';
import {
  ContextTreeRuntime,
  type ManatOSRuntimeRootContext,
  type MetadataLanguage,
} from '@manatos/shared';
import {
  UiListPageRuntime,
  createUiBrowserSurfaceResourcePort,
  uiListColumns,
  uiListAvailableViews,
  uiListFilterFields,
  uiListEntityLabel,
  multilingual,
  type UiListPageLevel,
  type UiFieldBehavior,
} from '@manatos/shared-ui';

/** Components share their Host's single canonical CTX; no copies of row data. */
@Injectable()
/** UIS ownership: a single Angular projection of the List Surface state and dispatch functions, not an alternate state store. */
export class ListContext {
  private readonly surfaces = inject(NgUiSurfaceManager, { optional: true });
  private runtime: UiListPageRuntime | null = null;
  private owningTree: ContextTreeRuntime<ManatOSRuntimeRootContext> | null = null;
  private unsubscribe: (() => void) | null = null;
  readonly level = signal<UiListPageLevel | null>(null);
  readonly language = signal<MetadataLanguage>('EN');
  readonly levelPath = computed(() => (this.level() ? (this.runtime?.levelPath ?? null) : null));

  open(
    tree: ContextTreeRuntime<ManatOSRuntimeRootContext>,
    entityKey: string,
    language: MetadataLanguage,
    options: {
      host?: 'page' | 'popup';
      parentLevelPath?: string | null;
      selectionMode?: 'none' | 'single' | 'multiple';
    } = {},
  ): void {
    this.language.set(language);
    const hostKind = options.host ?? 'page';
    // A semantic path can be reused after disposal; only the actual Surface
    // instance and owning ContextTreeRuntime are reliable identities.
    const existing = this.runtime;
    let validOwner = false;
    if (existing && this.owningTree === tree) {
      try {
        validOwner = tree.get(existing.levelPath) === existing.level;
      } catch {
        validOwner = false;
      }
    }
    if (
      existing &&
      validOwner &&
      existing.level.control.invocation.params['entityKey'] === entityKey &&
      existing.level.control.host === hostKind &&
      (hostKind === 'page' ||
        options.parentLevelPath == null ||
        existing.levelPath === `${options.parentLevelPath}.level`)
    )
      return;
    this.dispose();
    const runtime = new UiListPageRuntime(
      tree,
      entityKey,
      createUiBrowserSurfaceResourcePort(),
      options,
    );
    this.runtime = runtime;
    this.owningTree = tree;
    this.level.set(this.snapshot(runtime.level));
    this.unsubscribe = runtime.subscribe((level) => this.level.set(this.snapshot(level)));
  }
  /** Column's mounted semantic header owns the prepared FieldBehavior. */
  fieldBehaviorForColumn(index: number): UiFieldBehavior | undefined {
    return this.runtime?.fieldBehaviorForColumn(index);
  }
  readonly columns = () =>
    uiListColumns(
      String(this.level()?.control.invocation.params['entityKey'] ?? ''),
      this.language(),
      this.level()?.state.list.view ?? 'main',
    );
  readonly views = () =>
    uiListAvailableViews(
      String(this.level()?.control.invocation.params['entityKey'] ?? ''),
      this.language(),
    );
  readonly filterFields = () =>
    uiListFilterFields(
      String(this.level()?.control.invocation.params['entityKey'] ?? ''),
      this.language(),
      this.level()?.state.list.view ?? 'main',
    );
  readonly entityLabel = () => {
    const name = this.level()?.control.entityName;
    return name
      ? multilingual(this.language(), []).resolve(name)
      : uiListEntityLabel(
          String(this.level()?.control.invocation.params['entityKey'] ?? ''),
          this.language(),
        );
  };
  readonly emptyMessage = () =>
    multilingual(this.language(), []).resolve(
      this.level()?.data.filters.search ||
        Object.entries(this.level()?.data.filters ?? {}).some(
          ([key, value]) => key !== 'search' && Boolean(value),
        )
        ? '@CM.NoEntriesMatchFilters'
        : '@CM.NoEntriesFound',
    );
  readonly searchPlaceholder = () =>
    multilingual(this.language(), []).format(
      this.language() === 'EL' ? 'Αναζήτηση {entity}' : 'Search {entity}',
      { entity: this.entityLabel().toLocaleLowerCase(this.language() === 'EL' ? 'el' : 'en') },
    );

  /** Components send semantic events; the shared List components own interpretation. */
  dispatchAction(kind: string, action: string, field?: string): void {
    this.runtime?.dispatchAction(kind, action, field);
  }
  dispatchControl(kind: string, value: string, field?: string): void {
    this.runtime?.dispatchControl(kind, value, field);
  }
  setFiltersVisible(value: boolean): void {
    this.runtime?.setFiltersVisible(value);
  }
  setViewsOpen(value: boolean): void {
    this.runtime?.setViewsOpen(value);
  }
  setFiltersDocked(value: boolean): void {
    this.runtime?.setFiltersDocked(value);
  }
  setView(key: string): void {
    this.runtime?.setView(key);
  }
  setSearch(value: string): void {
    this.runtime?.setSearch(value);
  }
  setFilter(name: string, value: string): void {
    this.runtime?.setFilter(name, value);
  }
  readonly displayedTotalPages = () => Math.max(1, this.level()?.state.list.totalPages ?? 0);
  setPage(page: number): void {
    this.runtime?.setPage(page);
  }
  setPageSize(size: number): void {
    this.runtime?.setPageSize(size);
  }
  /** A single-select popup returns only rows accepted by the canonical List. */
  selectRow(id: string): boolean {
    return this.runtime?.selectRow(id) ?? false;
  }
  setSort(field: string): void {
    this.runtime?.setSort(field);
  }
  private snapshot(level: UiListPageLevel): UiListPageLevel {
    return {
      ...level,
      state: { ...level.state, list: { ...level.state.list } },
      data: { ...level.data, filters: { ...level.data.filters } },
    };
  }
  dispose(): void {
    const runtime = this.runtime;
    if (runtime && this.owningTree?.get(`${runtime.levelPath}.level`) !== undefined) {
      if (!this.surfaces) throw new Error('No popup manager to close nested List surfaces.');
      this.surfaces.closeDescendants(runtime.levelPath);
      if (this.owningTree?.get(`${runtime.levelPath}.level`) !== undefined)
        throw new Error('Cannot replace List while a nested Surface remains active.');
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.runtime = null;
    this.level.set(null);
    this.owningTree = null;
    runtime?.dispose();
  }
}
