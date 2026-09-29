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
  readonly #descriptor: EntityListDescriptor;
  #query: EntityListQuery;
  #entries: readonly T[] = [];
  #originalEntries: readonly T[] = [];
  #selectedIds = new Set<string>();
  #loading = false;
  #paging = { total: 0, page: 1, pageSize: 10, totalPages: 0 };
  #requestGeneration = 0;

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
      originalEntries: this.#originalEntries,
      selectedIds: [...this.#selectedIds],
      loading: this.#loading,
      paging: this.#paging,
    };
  }

  async load(): Promise<EntityListSnapshot<T>> {
    const generation = ++this.#requestGeneration;
    this.#loading = true;
    try {
      const page = await this.#definition.dataSource.load(this.#query);
      // Ignore a stale response if a newer query/load completed first.
      if (generation === this.#requestGeneration) {
        const projector = this.#definition.projectEntry;
        const projectedItems = projector
          ? await Promise.all(page.items.map((entry) => projector(entry)))
          : [...page.items];
        this.#entries = [...projectedItems];
        this.#originalEntries = [...projectedItems];
        this.#paging = page.paging;
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
