import type { CompiledExpression } from '@manatos/shared';

export type EntityListSortDirection = 'asc' | 'desc';
export type EntityListSelectionMode = 'none' | 'single' | 'multiple';

/** Canonical, host-neutral list query used by pages and selector popups alike. */
export interface EntityListQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly searchField?: string;
  readonly sort?: string;
  readonly direction: EntityListSortDirection;
  readonly filters: Readonly<Record<string, string>>;
  /** True means exclude. Keep the canonical compiled form in runtime state. */
  readonly listExceptions?: CompiledExpression;
}

export interface EntityListPage<T extends Readonly<Record<string, unknown>>> {
  readonly items: readonly T[];
  readonly paging: {
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly totalPages: number;
  };
}

/** Data acquisition is injected so EntityList is not coupled to page routes or popup code. */
export interface EntityListDataSource<T extends Readonly<Record<string, unknown>>> {
  load(query: EntityListQuery): Promise<EntityListPage<T>>;
}

export interface EntityListColumn {
  readonly field: string;
  readonly label: string;
  readonly sortable?: boolean;
  readonly filterable?: boolean;
}

/**
 * Resolved semantic identity of a list surface. Unlike EntityListDefinition,
 * this contains no executable host/data-acquisition concerns and is therefore
 * safe to publish with runtime/CTX state.
 */
export interface EntityListDescriptor {
  readonly entityKey: string;
  readonly idField: string;
  /** Resolved metadata list-view key. Hosts that have no named view use `main`. */
  readonly viewKey: string;
  readonly columns: readonly EntityListColumn[];
  readonly selectionMode: EntityListSelectionMode;
}

export interface EntityListDefinition<
  T extends Readonly<Record<string, unknown>>,
> extends EntityListDescriptor {
  readonly dataSource: EntityListDataSource<T>;
  /** Optional canonical record projection applied before list state is published. */
  readonly projectEntry?: (entry: T) => T | Promise<T>;
  readonly initialQuery: EntityListQuery;
}

export interface EntityListSnapshot<T extends Readonly<Record<string, unknown>>> {
  readonly definition: EntityListDescriptor;
  readonly query: EntityListQuery;
  readonly entries: readonly T[];
  readonly originalEntries: readonly T[];
  readonly selectedIds: readonly string[];
  readonly loading: boolean;
  readonly paging: EntityListPage<T>['paging'];
}
