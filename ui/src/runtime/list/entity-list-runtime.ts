import type {
  EntityListDefinition,
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
  #query: EntityListQuery;
  #entries: readonly T[] = [];
  #originalEntries: readonly T[] = [];
  #selectedIds = new Set<string>();
  #loading = false;
  #paging = { total: 0, page: 1, pageSize: 10, totalPages: 0 };
  #requestGeneration = 0;

  constructor(definition: EntityListDefinition<T>) {
    this.#definition = definition;
    this.#query = normalizeEntityListQuery(definition.initialQuery);
    this.#paging = { ...this.#paging, page: this.#query.page, pageSize: this.#query.pageSize };
  }

  get snapshot(): EntityListSnapshot<T> {
    return {
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
      if (generation !== this.#requestGeneration) return this.snapshot;
      const projector = this.#definition.projectEntry;
      const projectedItems = projector
        ? await Promise.all(page.items.map((entry) => projector(entry)))
        : [...page.items];
      this.#entries = [...projectedItems];
      this.#originalEntries = [...projectedItems];
      this.#paging = page.paging;
      this.#pruneSelection();
      return this.snapshot;
    } finally {
      if (generation === this.#requestGeneration) this.#loading = false;
    }
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

  selectedEntries(): readonly T[] {
    return this.#entries.filter((entry) => this.#selectedIds.has(this.#entryId(entry)));
  }

  #entryId(entry: T): string {
    return String(entry[this.#definition.idField] ?? '');
  }

  #pruneSelection(): void {
    const available = new Set(this.#entries.map((entry) => this.#entryId(entry)));
    for (const id of this.#selectedIds) {
      if (!available.has(id)) this.#selectedIds.delete(id);
    }
  }
}
