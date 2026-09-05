import {
  ExpressionEvaluationError,
  allSysBOMetadata,
  type EntityResolver,
  type SysBOEntity,
} from '@manatos/shared';

import type { AuthorizationService, AuthorizationSubject } from '../auth/authorization-service.js';
import type { InMemoryDataStore } from '../storage/in-memory-data-store.js';

/**
 * Current adapter-backed implementation of the generic expression EntityResolver.
 *
 * The expression engine depends only on the shared EntityResolver contract. This
 * implementation happens to read the current Map-backed datastore; a future SQL
 * adapter can translate the same calls into indexed queries, batching or recursive
 * CTEs without changing expression functions such as TraverseEntity().
 *
 * Expression resolution deliberately exposes only canonical metadata-declared,
 * non-sensitive fields. This is an important capability boundary: a browser-owned
 * expression may delegate TraverseEntity() to the API, but that must never turn the
 * expression endpoint/CLI into a way to retrieve storage-only secrets such as a
 * password hash. Future calculations that genuinely require sensitive material must
 * receive a separate, explicitly privileged capability rather than weakening this
 * resolver contract.
 *
 * Cache lifetime is intentionally one resolver/evaluation request. Persisted data
 * is therefore never globally cached by the expression layer.
 */
export class DataStoreEntityResolver implements EntityResolver {
  private readonly cache = new Map<string, Readonly<Record<string, unknown>> | null>();

  constructor(
    private readonly store: InMemoryDataStore,
    private readonly authorization?: AuthorizationService,
    private readonly subject?: AuthorizationSubject,
  ) {}

  async getById(entityKey: string, id: unknown): Promise<Readonly<Record<string, unknown>> | null> {
    const normalizedId = String(id ?? '');
    if (!entityKey || !normalizedId) return null;

    const metadata = allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata];
    if (!metadata) {
      throw new ExpressionEvaluationError(
        `EntityResolver cannot resolve unknown or non-SysBO entity '${entityKey}'.`,
      );
    }

    const cacheKey = `${entityKey}:${normalizedId}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey) ?? null;

    const collection = this.store.collectionForObjectKey(entityKey);
    const record = collection?.get(normalizedId) ?? null;

    if (record && this.authorization && this.subject) {
      await this.authorization.assertCan(
        'read',
        this.subject,
        entityKey,
        record as unknown as SysBOEntity,
      );
    }

    if (!record) {
      this.cache.set(cacheKey, null);
      return null;
    }

    const readableKeys = new Set<string>([
      ...Object.entries(metadata.fieldDefinition)
        .filter(([, field]) => field.sensitive !== true)
        .map(([key]) => key),
    ]);
    const projected = Object.fromEntries(
      [...readableKeys]
        .filter((key) => Object.prototype.hasOwnProperty.call(record, key))
        .map((key) => [key, record[key]]),
    );

    this.cache.set(cacheKey, projected);
    return projected;
  }
}
