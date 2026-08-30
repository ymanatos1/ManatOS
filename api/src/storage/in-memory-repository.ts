import { randomUUID } from 'node:crypto';

import {
  ConflictError,
  NotFoundError,
  type SysBOCreateInput,
  type SysBOEntity,
  type SysBOMetadata,
  type SysBOUpdateInput,
} from '@manatos/shared';

import { auditService, type AuditActor } from '../audit/audit-service.js';

/**
 * Standard query options supported by the current generic
 * in-memory repository.
 */
export interface ListQuery {
  page: number;
  pageSize: number;

  sort?: string;

  direction: 'asc' | 'desc';

  filters: Record<string, string>;
}

/**
 * In-memory-only collection visibility filter.
 *
 * Authorization owns the policy. The repository owns the execution point so
 * authorization happens before user filtering, sorting and pagination.
 */
export type InMemoryListAuthorizationFilter<T extends SysBOEntity> = (
  items: readonly T[],
) => Promise<T[]> | T[];

/**
 * Generic paged result returned from repository list operations.
 */
export interface ListResult<T> {
  items: T[];

  total: number;

  page: number;
  pageSize: number;

  totalPages: number;
}

/**
 * Generic Map-backed repository for the current in-memory
 * storage provider.
 *
 * Records are keyed by their generated GUID.
 *
 * Unique constraints are derived from hard-coded SysBO metadata,
 * allowing the in-memory implementation to enforce the same
 * invariants that future SQL adapters should represent through
 * UNIQUE database constraints.
 */
export class InMemoryRepository<T extends SysBOEntity> {
  constructor(
    private readonly records: Map<string, T>,

    private readonly metadata: SysBOMetadata<T>,
  ) {}

  /**
   * Return a filtered, sorted and paginated collection.
   */
  async list(
    query: ListQuery,
    authorizationFilter?: InMemoryListAuthorizationFilter<T>,
  ): Promise<ListResult<T>> {
    let items = [...this.records.values()];

    /*
     * Apply authorization first. This keeps paging totals based only on rows
     * the caller may see and prevents client filters from probing hidden rows.
     */
    if (authorizationFilter) {
      items = await authorizationFilter(items);
    }

    /*
     * Apply all supplied filters using AND semantics.
     */
    for (const [field, value] of Object.entries(query.filters)) {
      if (!value) {
        continue;
      }

      const needle = normalize(value);

      items = items.filter((item) => {
        const raw = (item as unknown as Record<string, unknown>)[field];

        return normalize(String(raw ?? '')).includes(needle);
      });
    }

    /*
     * Apply ordering only when the requested field actually exists
     * in the hard-coded BO metadata.
     */
    if (query.sort && this.metadata.fieldDefinition[query.sort]) {
      const field = query.sort;

      items.sort((leftItem, rightItem) => {
        const leftValue = (leftItem as unknown as Record<string, unknown>)[field];

        const rightValue = (rightItem as unknown as Record<string, unknown>)[field];

        const comparison = String(leftValue ?? '').localeCompare(
          String(rightValue ?? ''),

          undefined,

          {
            numeric: true,
            sensitivity: 'base',
          },
        );

        return query.direction === 'asc' ? comparison : -comparison;
      });
    }

    const total = items.length;

    const totalPages = Math.max(
      1,

      Math.ceil(total / query.pageSize),
    );

    const page = Math.min(
      Math.max(1, query.page),

      totalPages,
    );

    const start = (page - 1) * query.pageSize;

    return {
      items: items.slice(
        start,

        start + query.pageSize,
      ),

      total,

      page,

      pageSize: query.pageSize,

      totalPages,
    };
  }

  /**
   * Retrieve one entry by generated GUID.
   */
  async getById(id: string): Promise<T | null> {
    return this.records.get(id) ?? null;
  }

  /**
   * Search a field declared unique in BO metadata.
   *
   * Matching is currently case-insensitive and whitespace-normalized.
   */
  async findByUnique(field: string, value: unknown): Promise<T | null> {
    const target = normalize(String(value ?? ''));

    for (const record of this.records.values()) {
      const current = (record as unknown as Record<string, unknown>)[field];

      if (normalize(String(current ?? '')) === target) {
        return record;
      }
    }

    return null;
  }

  /**
   * Create and persist one in-memory record.
   *
   * The caller does not supply:
   *
   * - id
   * - createdAt
   * - createdBy
   * - updatedAt
   * - updatedBy
   *
   * Those values belong to the storage provider.
   */
  async create(input: SysBOCreateInput<T>, actor: AuditActor): Promise<T> {
    /*
     * Creation input is intentionally not a complete T yet.
     * ensureUnique() only needs a property bag, so no unsafe generic
     * Partial<T> assignment is required.
     */
    await this.ensureUnique(input as Record<string, unknown>);

    const audit = auditService.createStamp(actor);

    const record = {
      ...input,

      /*
       * The in-memory storage provider generates GUIDs itself.
       *
       * Future SQL providers may instead ask their database engine
       * to generate the GUID.
       */
      id: randomUUID(),

      ...audit,
    } as T;

    this.records.set(record.id, record);

    return record;
  }

  /**
   * Update an existing record.
   */
  async update(id: string, changes: SysBOUpdateInput<T>, actor: AuditActor): Promise<T> {
    const existing = this.records.get(id);

    if (!existing) {
      throw new NotFoundError(this.metadata.name, id);
    }

    /*
     * This runtime filtering is intentional even though TypeScript also
     * excludes these fields.
     *
     * An HTTP caller can still send arbitrary JSON at runtime.
     */
    const safeChanges = {
      ...changes,
    } as Record<string, unknown>;

    delete safeChanges.id;

    delete safeChanges.createdAt;
    delete safeChanges.createdBy;

    delete safeChanges.updatedAt;
    delete safeChanges.updatedBy;

    const audit = auditService.updateStamp(actor);

    const candidate = {
      ...existing,

      ...safeChanges,

      /*
       * Technical identity and creation audit are immutable.
       */
      id: existing.id,

      createdAt: existing.createdAt,

      createdBy: existing.createdBy,

      ...audit,
    } as T;

    await this.ensureUnique(
      candidate as unknown as Record<string, unknown>,

      id,
    );

    this.records.set(id, candidate);

    return candidate;
  }

  /**
   * Delete by generated GUID.
   */
  async delete(id: string, actor: AuditActor): Promise<void> {
    const existing = this.records.get(id);

    if (!existing) {
      throw new NotFoundError(this.metadata.name, id);
    }

    await auditService.beforeDelete(actor, this.metadata.key, existing);

    this.records.delete(id);
  }

  /**
   * Return all current values.
   *
   * Primarily useful for internal services and bootstrap logic.
   */
  values(): T[] {
    return [...this.records.values()];
  }

  /**
   * Enforce all metadata-defined unique fields.
   *
   * This method deliberately accepts a property bag rather than
   * Partial<T>.
   *
   * During creation, the entity does not yet have generated fields such
   * as id/createdAt/updatedAt, and TypeScript cannot safely prove that
   * Omit<T, ...> is assignable to Partial<T> for every possible generic T.
   *
   * The uniqueness algorithm only needs named field values, so
   * Record<string, unknown> describes its real requirement accurately.
   */
  private async ensureUnique(
    candidate: Record<string, unknown>,

    excludeId?: string,
  ): Promise<void> {
    const fields = Object.values(this.metadata.fieldDefinition);

    for (const field of fields) {
      /*
       * Generated values such as Id do not need business-level
       * duplicate checking here.
       */
      if (!field.unique || field.generated) {
        continue;
      }

      const value = candidate[field.key];

      /*
       * Empty optional values do not participate in uniqueness checks.
       */
      if (value === undefined || value === null || value === '') {
        continue;
      }

      const duplicate = await this.findByUnique(field.key, value);

      /*
       * During update the current record may naturally contain the same
       * unique value, so exclude its own Id.
       */
      if (duplicate && duplicate.id !== excludeId) {
        throw new ConflictError(
          'DUPLICATE_BO_VALUE',

          `${this.metadata.name}.${field.key} '${String(value)}' already exists.`,

          `${field.label} '${String(value)}' is already in use. Please enter another value.`,
        );
      }
    }
  }
}

/**
 * Canonical normalization used for case-insensitive uniqueness
 * and text matching.
 */
function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}
