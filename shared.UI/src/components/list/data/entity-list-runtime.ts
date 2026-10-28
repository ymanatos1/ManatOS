import type {
  EntityListDefinition,
  EntityListDescriptor,
  EntityListQuery,
  EntityListSnapshot,
} from './entity-list-contracts.js';
import { normalizeEntityListQuery } from './entity-list-query.js';

/**
 * Host-neutral list state machine shared by List Page and Entry Selector Popup.
 * DOM, page chrome and popup chrome are deliberately absent from this runtime.
 */
export class EntityListRuntime<T extends Readonly<Record<string, unknown>>> {
  readonly #definition: EntityListDefinition<T>;
  #descriptor: EntityListDescriptor;
  #query: EntityListQuery;
  #entries: readonly T[] = [];
  #references: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>> = {};
  #imageVariants: Readonly<Record<string, unknown>> = {};
  #selectedIds = new Set<string>();
  #loading = false;
  #paging = { total: 0, page: 1, pageSize: 10, totalPages: 0 };
  #requestGeneration = 0;
  #pageSizeOptions: readonly number[] = [2, 5, 10, 20, 50, 100];

  constructor(definition: EntityListDefinition<T>) {
    this.#definition = definition;
    this.#descriptor = Object.freeze({
      entityKey: definition.entityKey,
      idField: definition.idField,
      viewKey: definition.viewKey,
      columns: Object.freeze(definition.columns.map((column) => Object.freeze({ ...column }))),
      selectionMode: definition.selectionMode,
    });
    this.#query = normalizeEntityListQuery(definition.initialQuery);
    this.#paging = { ...this.#paging, page: this.#query.page, pageSize: this.#query.pageSize };
  }

  get snapshot(): EntityListSnapshot<T> {
    return {
      definition: this.#descriptor,
      query: this.#query,
      entries: this.#entries,
      references: this.#references,
      imageVariants: this.#imageVariants,
      selectedIds: [...this.#selectedIds],
      loading: this.#loading,
      paging: this.#paging,
      pageSizeOptions: this.#pageSizeOptions,
    };
  }

  async load(): Promise<EntityListSnapshot<T>> {
    const generation = ++this.#requestGeneration;
    this.#loading = true;
    this.#entries = [];
    this.#references = {};
    this.#imageVariants = {};
    this.#paging = {
      total: 0,
      page: this.#query.page,
      pageSize: this.#query.pageSize,
      totalPages: 0,
    };
    try {
      const page = await this.#definition.dataSource.load(this.#query);
      // Ignore a stale response if a newer query/load completed first.
      if (generation === this.#requestGeneration) {
        const projector = this.#definition.projectEntry;
        const projectedItems = projector
          ? await Promise.all(page.items.map((entry) => projector(entry)))
          : [...page.items];
        if (generation !== this.#requestGeneration) return this.snapshot;
        this.#entries = [...projectedItems];
        this.#references = page.references ?? {};
        this.#imageVariants = page.imageVariants ?? {};
        this.#paging = page.paging;
        // The session-scoped selection is authoritative on the first List load.
        if (this.#query.pageSize !== page.paging.pageSize || this.#query.page !== page.paging.page)
          this.#query = normalizeEntityListQuery({
            ...this.#query,
            page: page.paging.page,
            pageSize: page.paging.pageSize,
          });
        if (page.pageSizeOptions?.length) this.#pageSizeOptions = [...page.pageSizeOptions];
      }
    } finally {
      if (generation === this.#requestGeneration) this.#loading = false;
    }
    return this.snapshot;
  }

  async setQuery(patch: Partial<EntityListQuery>): Promise<EntityListSnapshot<T>> {
    this.#query = normalizeEntityListQuery({
      ...this.#query,
      ...patch,
      filters: patch.filters ?? this.#query.filters,
    });
    return this.load();
  }

  /** Change the canonical view and its actual column descriptor together. */
  async setView(
    viewKey: string,
    columns: readonly EntityListDescriptor['columns'][number][],
  ): Promise<EntityListSnapshot<T>> {
    this.#descriptor = Object.freeze({
      ...this.#descriptor,
      viewKey,
      columns: Object.freeze(columns.map((column) => Object.freeze({ ...column }))),
    });
    // List views are presentation-only; no data-query mutation or re-request.
    return this.snapshot;
  }

  async setSearch(search: string): Promise<EntityListSnapshot<T>> {
    return this.setQuery({ page: 1, search });
  }

  async setFilter(field: string, value: string): Promise<EntityListSnapshot<T>> {
    return this.setQuery({ page: 1, filters: { ...this.#query.filters, [field]: value } });
  }

  async setSort(sort: string, direction: 'asc' | 'desc'): Promise<EntityListSnapshot<T>> {
    return this.setQuery({ page: 1, sort, direction });
  }

  async setPage(page: number): Promise<EntityListSnapshot<T>> {
    return this.setQuery({ page });
  }

  select(id: string): void {
    if (this.#definition.selectionMode === 'none') return;
    if (this.#definition.selectionMode === 'single') this.#selectedIds.clear();
    this.#selectedIds.add(id);
  }

  deselect(id: string): void {
    this.#selectedIds.delete(id);
  }

  clearSelection(): void {
    this.#selectedIds.clear();
  }
}
