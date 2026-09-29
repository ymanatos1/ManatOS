import { randomUUID } from 'node:crypto';

import {
  allManatOSObjectMetadata,
  createEnumsContext,
  evaluateExpression,
  operationContext,
  relationshipForField,
  normalizeMetadataFieldValues,
  type SysBOCreateInput,
  type SysBOEntity,
  type SysBOMetadata,
  type SysBOUpdateInput,
  type SysBOPictureValue,
  ValidationAppError,
  NotFoundError,
} from '@manatos/shared';

import type { AuditActor } from '../../audit/audit-service.js';

import { materializePersistedCalculations } from '../../storage/persisted-calculation.js';

import type { InMemoryDataStore } from '../../storage/in-memory-data-store.js';

import type {
  InMemoryListAuthorizationFilter,
  InMemoryRepository,
  ListQuery,
  ListResult,
} from '../../storage/in-memory-repository.js';

import { DataStoreEntityResolver } from '../relationships/entity-resolver.js';
import {
  RelationshipIntegrityService,
  type DeleteImpactPlan,
} from '../relationships/integrity-service.js';

export interface AggregateCommitInput {
  entries: ReadonlyArray<Record<string, unknown>>;
  entriesOriginal: ReadonlyArray<Record<string, unknown>>;
  identityField?: string;
}

export interface AggregateCommitResult<T extends SysBOEntity> {
  items: T[];
  idMap: Record<string, string>;
}

/**
 * Generic application/service layer for metadata-driven SysBOs.
 *
 * Responsibilities:
 *
 * - expose standard CRUD operations;
 * - delegate actual data access to the injected repository;
 * - wrap mutating operations in datastore transactions;
 * - add semantic operation tracing around persistence operations.
 *
 * More specialized SysBO services can derive from this class and
 * add domain-specific validation or behavior.
 */
export class GenericSysBOService<T extends SysBOEntity> {
  constructor(
    protected readonly store: InMemoryDataStore,
    protected readonly repository: InMemoryRepository<T>,
    public readonly metadata: SysBOMetadata<T>,
  ) {}

  acquireExplicitTransactionOperation(transactionId: string, ownerId: string): void {
    this.store.acquireExplicitTransactionOperation(transactionId, ownerId);
  }

  releaseExplicitTransactionOperation(transactionId: string, ownerId: string): void {
    this.store.releaseExplicitTransactionOperation(transactionId, ownerId);
  }

  runInExplicitTransaction<R>(transactionId: string, ownerId: string, operation: () => R): R {
    return this.store.runInExplicitTransaction(transactionId, ownerId, operation);
  }

  private pictureField(fieldKey: string) {
    const field = this.metadata.fieldDefinition[fieldKey];
    if (!field || field.type !== 'picture') {
      throw new ValidationAppError(
        `Field '${fieldKey}' is not a picture field on ${this.metadata.key}.`,
        'The selected field does not accept pictures.',
      );
    }
    return field;
  }

  async readPicture(
    id: string,
    fieldKey: string,
  ): Promise<{ picture: SysBOPictureValue; bytes: Buffer } | null> {
    this.pictureField(fieldKey);
    const item = await this.repository.getById(id);
    if (!item) throw new NotFoundError(this.metadata.label, id);
    const picture = (item as unknown as Record<string, unknown>)[fieldKey] as
      SysBOPictureValue | null | undefined;
    if (!picture) return null;
    const bytes = await this.store.readPicture(this.metadata.key, id, fieldKey, picture);
    return bytes ? { picture, bytes } : null;
  }

  async writePicture(
    id: string,
    fieldKey: string,
    contentType: SysBOPictureValue['contentType'],
    bytes: Buffer,
    actor: AuditActor,
  ): Promise<T> {
    this.pictureField(fieldKey);
    const existing = await this.repository.getById(id);
    if (!existing) throw new NotFoundError(this.metadata.label, id);
    const previous = (existing as unknown as Record<string, unknown>)[fieldKey] as
      SysBOPictureValue | null | undefined;
    const revision = randomUUID();
    const picture: SysBOPictureValue = { contentType, size: bytes.byteLength, revision };
    await this.store.writePicture(this.metadata.key, id, fieldKey, contentType, bytes, revision);
    const explicit = this.store.hasExplicitTransaction();
    if (explicit) {
      // The file write completed before the JSON mutation. Enlist its
      // compensation immediately so reverse rollback restores JSON before
      // removing the file that JSON may still reference.
      this.store.registerExplicitTransactionActions(`Create new ${fieldKey} picture`, {
        rollback: [
          {
            description: `Delete new ${fieldKey} picture`,
            execute: () => this.store.deletePicture(this.metadata.key, id, fieldKey, picture),
          },
        ],
      });
    }
    try {
      const updated = await this.store.executeTransaction(() =>
        this.repository.update(id, { [fieldKey]: picture } as SysBOUpdateInput<T>, actor),
      );
      if (explicit) {
        this.store.registerExplicitTransactionActions(`Replace ${fieldKey} picture`, {
          commit: previous
            ? [
                {
                  description: `Delete superseded ${fieldKey} picture`,
                  execute: () =>
                    this.store.deletePicture(this.metadata.key, id, fieldKey, previous),
                },
              ]
            : [],
        });
      } else {
        await this.store.deletePicture(this.metadata.key, id, fieldKey, previous);
      }
      return updated;
    } catch (error) {
      // Once an explicit transaction has journalled the successful physical
      // write, its outer rollback owns compensation. Standalone behavior is
      // unchanged and still cleans the file locally.
      if (!explicit) await this.store.deletePicture(this.metadata.key, id, fieldKey, picture);
      throw error;
    }
  }

  async clearPicture(id: string, fieldKey: string, actor: AuditActor): Promise<T> {
    this.pictureField(fieldKey);
    const existing = await this.repository.getById(id);
    if (!existing) throw new NotFoundError(this.metadata.label, id);
    const previous = (existing as unknown as Record<string, unknown>)[fieldKey] as
      SysBOPictureValue | null | undefined;
    const updated = await this.store.executeTransaction(() =>
      this.repository.update(id, { [fieldKey]: null } as SysBOUpdateInput<T>, actor),
    );
    if (this.store.hasExplicitTransaction() && previous) {
      this.store.registerExplicitTransactionActions(`Clear ${fieldKey} picture`, {
        commit: [
          {
            description: `Delete cleared ${fieldKey} picture`,
            execute: () => this.store.deletePicture(this.metadata.key, id, fieldKey, previous),
          },
        ],
      });
    } else {
      await this.store.deletePicture(this.metadata.key, id, fieldKey, previous);
    }
    return updated;
  }

  private picturesField(fieldKey: string) {
    const field = this.metadata.fieldDefinition[fieldKey];
    if (!field || field.type !== 'pictures') {
      throw new ValidationAppError(
        `Field '${fieldKey}' is not a pictures field on ${this.metadata.key}.`,
        'The selected field does not accept an ordered picture collection.',
      );
    }
    return field;
  }

  async readPictureItem(
    id: string,
    fieldKey: string,
    pictureId: string,
  ): Promise<{ picture: SysBOPictureValue; bytes: Buffer } | null> {
    this.picturesField(fieldKey);
    const item = await this.repository.getById(id);
    if (!item) throw new NotFoundError(this.metadata.label, id);
    const pictures =
      ((item as unknown as Record<string, unknown>)[fieldKey] as SysBOPictureValue[] | undefined) ??
      [];
    const picture = pictures.find((candidate) => candidate.id === pictureId);
    if (!picture) return null;
    const bytes = await this.store.readPictureItem(this.metadata.key, id, fieldKey, picture);
    return bytes ? { picture, bytes } : null;
  }

  async replacePictureItems(
    id: string,
    fieldKey: string,
    replacement: ReadonlyArray<{
      id?: string;
      contentType?: SysBOPictureValue['contentType'];
      bytes?: Buffer;
    }>,
    actor: AuditActor,
  ): Promise<T> {
    this.picturesField(fieldKey);
    const existing = await this.repository.getById(id);
    if (!existing) throw new NotFoundError(this.metadata.label, id);

    const previous =
      ((existing as unknown as Record<string, unknown>)[fieldKey] as
        SysBOPictureValue[] | undefined) ?? [];
    const previousById = new Map(
      previous.filter((picture) => picture.id).map((picture) => [picture.id!, picture]),
    );

    const prepared = await Promise.all(
      replacement.map(async (entry, index) => {
        if (entry.id) {
          const picture = previousById.get(entry.id);
          if (!picture) {
            throw new ValidationAppError(
              `Picture '${entry.id}' at position ${index} is not part of the persisted collection.`,
              'The pictures could not be replaced because the saved collection changed.',
            );
          }
          const bytes = await this.store.readPictureItem(this.metadata.key, id, fieldKey, picture);
          if (!bytes) {
            throw new ValidationAppError(
              `Stored picture '${entry.id}' could not be read.`,
              'One of the saved pictures is unavailable.',
            );
          }
          return { contentType: picture.contentType, bytes };
        }

        if (!entry.contentType || !entry.bytes?.length) {
          throw new ValidationAppError(
            `Picture at position ${index} has no usable content.`,
            'One of the replacement pictures is invalid.',
          );
        }
        return { contentType: entry.contentType, bytes: entry.bytes };
      }),
    );

    const next = prepared.map(({ contentType, bytes }) => ({
      id: randomUUID(),
      contentType,
      size: bytes.byteLength,
      revision: randomUUID(),
    })) satisfies SysBOPictureValue[];

    const written: SysBOPictureValue[] = [];
    try {
      for (let index = 0; index < next.length; index += 1) {
        const picture = next[index]!;
        const source = prepared[index]!;
        await this.store.writePictureItem(
          this.metadata.key,
          id,
          fieldKey,
          picture.id!,
          source.contentType,
          source.bytes,
          picture.revision,
        );
        written.push(picture);
        if (this.store.hasExplicitTransaction()) {
          this.store.registerExplicitTransactionActions(
            `Create new ${fieldKey} picture '${picture.id ?? ''}'`,
            {
              rollback: [
                {
                  description: `Delete new ${fieldKey} picture '${picture.id ?? ''}'`,
                  execute: () =>
                    this.store.deletePictureItem(this.metadata.key, id, fieldKey, picture),
                },
              ],
            },
          );
        }
      }

      const updated = await this.store.executeTransaction(() =>
        this.repository.update(id, { [fieldKey]: next } as SysBOUpdateInput<T>, actor),
      );

      if (this.store.hasExplicitTransaction()) {
        this.store.registerExplicitTransactionActions(`Replace ${fieldKey} pictures`, {
          commit: previous.map((picture) => ({
            description: `Delete superseded ${fieldKey} picture '${picture.id ?? ''}'`,
            execute: () => this.store.deletePictureItem(this.metadata.key, id, fieldKey, picture),
          })),
        });
      } else {
        await Promise.all(
          previous.map((picture) =>
            this.store.deletePictureItem(this.metadata.key, id, fieldKey, picture),
          ),
        );
      }
      return updated;
    } catch (error) {
      if (!this.store.hasExplicitTransaction()) {
        await Promise.all(
          written.map((picture) =>
            this.store.deletePictureItem(this.metadata.key, id, fieldKey, picture),
          ),
        );
      }
      throw error;
    }
  }

  /** Project non-persistent semantic fields after storage reads. */
  protected async projectRuntimeFields(item: T): Promise<T> {
    return item;
  }

  /** Apply writable non-persistent fields inside the same datastore transaction. */
  protected async applyNonPersistentUpdates(
    id: string,
    changes: Readonly<Record<string, unknown>>,
    actor: AuditActor,
  ): Promise<void> {
    void id;
    void changes;
    void actor;
  }

  /**
   * Return a filtered, sorted and paginated list of entities.
   */
  async list(
    query: ListQuery,
    authorizationFilter?: InMemoryListAuthorizationFilter<T>,
  ): Promise<ListResult<T>> {
    const result = await this.repository.list(query, authorizationFilter);
    return {
      ...result,
      items: await Promise.all(
        result.items.map(async (item) =>
          this.projectRuntimeFields(
            this.hasPersistedCalculatedFields()
              ? await this.materializePersistedCalculatedFields(item)
              : item,
          ),
        ),
      ),
    };
  }

  /**
   * Retrieve one entity by its generated GUID.
   *
   * Returns null when the entity does not exist.
   */
  async get(id: string): Promise<T | null> {
    const item = await this.repository.getById(id);
    if (!item) return null;
    const materialized = this.hasPersistedCalculatedFields()
      ? await this.materializePersistedCalculatedFields(item)
      : item;
    return this.projectRuntimeFields(materialized);
  }

  /**
   * Create a new entity.
   *
   * Technical fields are generated by the storage layer:
   *
   * - id
   * - createdAt
   * - createdBy
   * - updatedAt
   * - updatedBy
   *
   * The repository is responsible for enforcing metadata-defined
   * uniqueness constraints.
   */
  async create(input: SysBOCreateInput<T>, actor: AuditActor): Promise<T> {
    return this.store.executeTransaction(() =>
      operationContext.run(
        `Create ${this.metadata.label} in data store`,

        async (scope) => {
          scope.comment('name', input.name);

          scope.comment('createdBy', actor.userName);

          const initializedInput = this.applyCreateDefaults(input);
          const normalizedAll = this.normalizeFields(
            initializedInput as unknown as Record<string, unknown>,
          );
          const persistentInput = Object.fromEntries(
            Object.entries(normalizedAll).filter(
              ([key]) => this.metadata.fieldDefinition[key]?.persistent !== false,
            ),
          ) as SysBOCreateInput<T>;
          const created = await this.repository.create(persistentInput, actor, (record) =>
            this.materializePersistedCalculatedFields(record),
          );
          await this.applyNonPersistentUpdates(created.id, normalizedAll, actor);
          await this.refreshPersistedCalculatedCollection();
          return this.projectRuntimeFields((await this.repository.getById(created.id)) ?? created);
        },
      ),
    );
  }

  /**
   * Update an existing entity.
   *
   * The repository is responsible for:
   *
   * - checking existence;
   * - enforcing metadata-defined uniqueness;
   * - updating updatedAt, updatedBy.
   */
  async update(id: string, changes: SysBOUpdateInput<T>, actor: AuditActor): Promise<T> {
    return this.store.executeTransaction(() =>
      operationContext.run(
        `Update ${this.metadata.label} in data store`,

        async (scope) => {
          scope.addContext({
            id,
            name: changes.name,
            updatedBy: actor.userName,
          });

          const normalizedAll = this.normalizeFields(changes as unknown as Record<string, unknown>);
          const persistentChanges = Object.fromEntries(
            Object.entries(normalizedAll).filter(
              ([key]) => this.metadata.fieldDefinition[key]?.persistent !== false,
            ),
          ) as SysBOUpdateInput<T>;
          const updated = Object.keys(persistentChanges).length
            ? await this.repository.update(id, persistentChanges, actor, (record) =>
                this.materializePersistedCalculatedFields(record),
              )
            : ((await this.repository.getById(id)) ??
              (() => {
                throw new NotFoundError(this.metadata.label, id);
              })());
          await this.applyNonPersistentUpdates(id, normalizedAll, actor);
          await this.refreshPersistedCalculatedCollection();
          return this.projectRuntimeFields((await this.repository.getById(updated.id)) ?? updated);
        },
      ),
    );
  }

  /**
   * Apply canonical BO create defaults before validation/persistence.
   *
   * The expression scope is intentionally UI-neutral. `entityName` and
   * `entry.current` form the same initialization context used by browser V2
   * entry creation, while `entities` exposes the canonical metadata registry.
   * Canonical defaults therefore never depend on `#level` or any UI surface.
   */
  protected applyCreateDefaults(input: SysBOCreateInput<T>): SysBOCreateInput<T> {
    const current: Record<string, unknown> = {
      ...(input as unknown as Record<string, unknown>),
    };
    const entities = Object.fromEntries(
      Object.values(allManatOSObjectMetadata).map((definition) => [
        definition.name,
        { key: definition.key, name: definition.name, metadata: definition },
      ]),
    );
    const root = { entities, enums: createEnumsContext() };
    const initialization = {
      entityName: this.metadata.name,
      entry: { current },
    };
    const orderedFields = Object.values(this.metadata.fieldDefinition).sort(
      (left, right) => left.order - right.order,
    );

    for (const field of orderedFields) {
      if (!Object.prototype.hasOwnProperty.call(field, 'createDefaultValue')) continue;
      const key = field.key;
      const existing = current[key];
      if (existing !== null && existing !== undefined && existing !== '') continue;

      const declaration = field.createDefaultValue;
      const value =
        declaration && typeof declaration === 'object' && 'expression' in declaration
          ? evaluateExpression(declaration.expression, root, initialization, {
              source: 'other',
              purpose: `Initialize ${this.metadata.name}.${key}`,
              targetPath: `initialization.entry.current.${key}`,
            })
          : (declaration ?? null);
      if (value !== undefined) current[key] = value;
    }

    return current as SysBOCreateInput<T>;
  }

  /** Apply metadata-declared field normalization at the authoritative API boundary. */
  protected normalizeFields(values: Record<string, unknown>): Record<string, unknown> {
    return normalizeMetadataFieldValues(this.metadata, values);
  }

  /** Whether this entity declares any calculated value that must be stored. */
  private hasPersistedCalculatedFields(): boolean {
    return Object.values(this.metadata.fieldDefinition).some(
      (field) => field.calculation?.persisted === true,
    );
  }

  /** Materialize the canonical persisted-calculation behavior before commit. */
  protected async materializePersistedCalculatedFields(record: T): Promise<T> {
    return materializePersistedCalculations(
      this.metadata,
      record,
      new DataStoreEntityResolver(this.store),
    );
  }

  /**
   * Recalculate materialized calculated values for the complete same-entity
   * collection before transaction commit. This is required for hierarchy-like
   * formulas where changing one record can alter a descendant's stored result.
   * The sweep is metadata-driven and therefore applies equally to future
   * entities with persisted calculated fields.
   */
  protected async refreshPersistedCalculatedCollection(): Promise<void> {
    if (!this.hasPersistedCalculatedFields()) return;
    const collection = this.store.collectionForObjectKey(this.metadata.key);
    if (!collection?.size) return;

    const persistedKeys = Object.entries(this.metadata.fieldDefinition)
      .filter(([, field]) => field.calculation?.persisted === true)
      .map(([key]) => key);
    const maxPasses = Math.max(4, collection.size * 2);

    for (let pass = 0; pass < maxPasses; pass += 1) {
      let changed = false;

      for (const [id, raw] of collection.entries()) {
        const materialized = await this.materializePersistedCalculatedFields(raw as unknown as T);
        const next = materialized as unknown as Record<string, unknown>;
        if (!persistedKeys.some((key) => !Object.is(raw[key], next[key]))) continue;

        collection.set(id, next);
        changed = true;
      }

      if (!changed) return;
    }

    throw new Error(
      `Persisted calculated collection for ${this.metadata.key} did not settle within ${maxPasses} passes.`,
    );
  }

  /**
   * Atomically persist an owner-managed working collection. Temporary `draft:*`
   * identities are resolved inside the transaction and same-entity references
   * are rewritten before persistence. This is intentionally entity-agnostic so
   * hierarchy/aggregate workspaces do not need bespoke persistence code.
   */
  async commitAggregate(
    input: AggregateCommitInput,
    actor: AuditActor,
  ): Promise<AggregateCommitResult<T>> {
    const identityField = String(input.identityField || 'id');
    const current = input.entries.map((row) => ({ ...row }));
    const original = input.entriesOriginal.map((row) => ({ ...row }));
    const originalIds = new Set(
      original.map((row) => String(row[identityField] ?? '')).filter(Boolean),
    );
    const originalById = new Map(
      original.map((row) => [String(row[identityField] ?? ''), row] as const),
    );
    const currentIds = new Set(
      current.map((row) => String(row[identityField] ?? '')).filter(Boolean),
    );
    const draftRows = current.filter((row) =>
      String(row[identityField] ?? '').startsWith('draft:'),
    );
    const existingRows = current.filter(
      (row) => !String(row[identityField] ?? '').startsWith('draft:'),
    );
    const deletedIds = [...originalIds].filter((id) => !currentIds.has(id));
    const idMap: Record<string, string> = {};

    const sameEntityReferenceFields = Object.values(this.metadata.fieldDefinition)
      .filter(
        (field) =>
          relationshipForField(this.metadata, field.key)?.relationship.references.objectKey ===
          this.metadata.key,
      )
      .map((field) => field.key);
    const editableFieldKeys = Object.values(this.metadata.fieldDefinition)
      .filter(
        (field) =>
          field.persistent !== false &&
          field.generated !== true &&
          field.readOnly !== true &&
          field.applicationManaged !== true,
      )
      .map((field) => field.key);

    const persistenceValues = (row: Record<string, unknown>) => {
      const values: Record<string, unknown> = {};
      for (const key of editableFieldKeys) {
        if (Object.prototype.hasOwnProperty.call(row, key)) values[key] = row[key];
      }
      for (const key of sameEntityReferenceFields) {
        const value = values[key];
        if (typeof value === 'string' && idMap[value]) values[key] = idMap[value];
      }
      return this.normalizeFields(values);
    };

    return this.store.executeTransaction(() =>
      operationContext.run(`Commit ${this.metadata.label} aggregate`, async (scope) => {
        scope.addContext({
          created: draftRows.length,
          updated: existingRows.length,
          deleted: deletedIds.length,
          actor: actor.userName,
        });

        // Create drafts in dependency order so same-entity draft references can
        // be rewritten to real generated IDs before each repository insert.
        const pending = [...draftRows];
        while (pending.length) {
          const index = pending.findIndex((row) =>
            sameEntityReferenceFields.every((key) => {
              const value = row[key];
              return (
                !(typeof value === 'string' && value.startsWith('draft:')) || Boolean(idMap[value])
              );
            }),
          );
          if (index < 0)
            throw new Error(
              `Aggregate ${this.metadata.label} contains unresolved/cyclic draft references.`,
            );
          const row = pending.splice(index, 1)[0];
          if (!row)
            throw new Error(`Aggregate ${this.metadata.label} draft queue changed unexpectedly.`);
          const draftId = String(row[identityField] ?? '');
          const created = await this.repository.create(
            persistenceValues(row) as SysBOCreateInput<T>,
            actor,
            (record) => this.materializePersistedCalculatedFields(record),
          );
          idMap[draftId] = created.id;
        }

        // Apply working values to records that already existed when the owner
        // workspace opened. Draft references are resolved through idMap.
        for (const row of existingRows) {
          const id = String(row[identityField] ?? '');
          if (!id || !originalIds.has(id)) continue;
          const nextValues = persistenceValues(row);
          const baseline = originalById.get(id);
          const baselineValues = baseline ? persistenceValues(baseline) : {};
          // API persistence owns a separate serialized-value delta boundary: these values are
          // persistence payloads, not UI CTX values. Keep this comparison local to that contract.
          const changedValues = Object.fromEntries(
            Object.entries(nextValues).filter(
              ([key, value]) => JSON.stringify(value) !== JSON.stringify(baselineValues[key]),
            ),
          );
          if (!Object.keys(changedValues).length) continue;
          // Owner-managed workspaces are long-lived semantic drafts. Never replay
          // untouched baseline fields: another actor may have changed them since
          // this workspace opened. Concurrency enforcement can later use the
          // retained baseline audit/version fields without changing this delta contract.
          await this.repository.update(id, changedValues as SysBOUpdateInput<T>, actor, (record) =>
            this.materializePersistedCalculatedFields(record),
          );
        }

        // Delete members removed from the working aggregate after reparenting
        // and updates have already been applied. Relationship policies remain
        // authoritative for every deletion.
        for (const id of deletedIds) {
          new RelationshipIntegrityService(this.store).applyDeletePolicies(this.metadata.key, id);
          await this.repository.delete(id, actor);
        }

        await this.refreshPersistedCalculatedCollection();
        const finalIds: string[] = current
          .map((row) => {
            const id = String(row[identityField] ?? '');
            return idMap[id] || id;
          })
          .filter((id): id is string => Boolean(id));

        const items: T[] = [];
        for (const id of finalIds) {
          const item = await this.repository.getById(id);
          if (item) items.push(item);
        }

        return { items, idMap };
      }),
    );
  }

  /** Preview relationship-driven consequences before deleting this record. */
  deleteImpact(id: string): DeleteImpactPlan {
    return new RelationshipIntegrityService(this.store).previewDelete(this.metadata.key, id);
  }

  /**
   * Delete an existing entity by GUID. Referential effects are derived from
   * canonical relationship metadata; no entity-specific cascade code belongs
   * here.
   */
  async delete(id: string, actor: AuditActor): Promise<void> {
    const existing = await this.repository.getById(id);
    const pictures = existing
      ? Object.values(this.metadata.fieldDefinition)
          .filter((field) => field.type === 'picture')
          .map(
            (field) =>
              [
                field.key,
                (existing as unknown as Record<string, unknown>)[field.key] as
                  SysBOPictureValue | null | undefined,
              ] as const,
          )
      : [];
    const pictureCollections = existing
      ? Object.values(this.metadata.fieldDefinition)
          .filter((field) => field.type === 'pictures')
          .flatMap((field) => {
            const values =
              ((existing as unknown as Record<string, unknown>)[field.key] as
                SysBOPictureValue[] | undefined) ?? [];
            return values.map((picture) => [field.key, picture] as const);
          })
      : [];

    await this.store.executeTransaction(() =>
      operationContext.run(
        `Delete ${this.metadata.label} from data store`,

        async (scope) => {
          scope.addContext({
            id,
            deletedBy: actor.userName,
          });

          new RelationshipIntegrityService(this.store).applyDeletePolicies(this.metadata.key, id);
          await this.repository.delete(id, actor);
        },
      ),
    );

    const pictureDeletes = [
      ...pictures
        .filter(([, picture]) => Boolean(picture))
        .map(([fieldKey, picture]) => ({
          description: `Delete ${fieldKey} picture for deleted ${this.metadata.label}`,
          execute: () => this.store.deletePicture(this.metadata.key, id, fieldKey, picture),
        })),
      ...pictureCollections.map(([fieldKey, picture]) => ({
        description: `Delete ${fieldKey} picture '${picture.id ?? ''}' for deleted ${this.metadata.label}`,
        execute: () => this.store.deletePictureItem(this.metadata.key, id, fieldKey, picture),
      })),
    ];

    if (this.store.hasExplicitTransaction()) {
      // A deleted record can still be restored by the datastore rollback snapshot.
      // Keep every physical picture intact until the enclosing transaction commits.
      this.store.registerExplicitTransactionActions(`Delete ${this.metadata.label} pictures`, {
        commit: pictureDeletes,
      });
    } else {
      await Promise.all(pictureDeletes.map((action) => action.execute()));
    }
  }
}
