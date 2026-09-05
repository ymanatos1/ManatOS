import {
  ConflictError,
  allManatOSObjectMetadata,
  type ManatOSRelationshipDeleteAction,
  type ManatOSRelationshipConfirmationPolicy,
  type ManatOSRelationshipMetadata,
} from '@manatos/shared';

import type { InMemoryDataStore } from '../storage/in-memory-data-store.js';

export interface DeleteImpactItem {
  objectKey: string;
  objectName: string;
  relationship: string;
  count: number;
  action: ManatOSRelationshipDeleteAction;
  confirmation: ManatOSRelationshipConfirmationPolicy;
}

export interface RelationshipRepairReport {
  repaired: number;
  unresolved: Array<{
    objectKey: string;
    recordId: string;
    relationship: string;
    referencedObjectKey: string;
  }>;
}

export interface DeleteImpactPlan {
  targetObjectKey: string;
  targetId: string;
  canExecute: boolean;
  requiresConfirmation: boolean;
  impacts: readonly DeleteImpactItem[];
}

type ObjectMetadata = (typeof allManatOSObjectMetadata)[keyof typeof allManatOSObjectMetadata];

/**
 * Generic referential-integrity planner/executor driven entirely by canonical
 * relationship metadata. It deliberately knows nothing about SysBOUser or any
 * other particular entity. The current in-memory adapter exposes collections
 * by metadata key; future SQL adapters can implement the same planning contract
 * using database metadata/query primitives.
 */
export class RelationshipIntegrityService {
  constructor(private readonly store: InMemoryDataStore) {}

  previewDelete(targetObjectKey: string, targetId: string): DeleteImpactPlan {
    const impacts = this.directImpacts(targetObjectKey, targetId);
    return {
      targetObjectKey,
      targetId,
      canExecute: impacts.every((impact) => impact.action !== 'restrict'),
      requiresConfirmation: impacts.some((impact) => impact.confirmation === 'confirm'),
      impacts,
    };
  }

  applyDeletePolicies(targetObjectKey: string, targetId: string): void {
    this.applyRecursive(targetObjectKey, targetId, new Set<string>());
  }

  /**
   * Startup/maintenance integrity pass. It repairs historical orphans using the
   * same metadata policy that would have prevented them during deletion. This
   * is intentionally generic, so an orphan External Identity is not treated as
   * a special SysBOUser case.
   */
  repairOrphanedReferences(): RelationshipRepairReport {
    let repaired = 0;
    const unresolved: RelationshipRepairReport['unresolved'] = [];

    for (const metadata of Object.values(allManatOSObjectMetadata) as ObjectMetadata[]) {
      const source = this.store.collectionForObjectKey(metadata.key);
      if (!source) continue;

      for (const [relationshipKey, relationship] of Object.entries(metadata.relationships ?? {})) {
        if (relationship.fields.length !== 1 || relationship.references.fields.length !== 1)
          continue;
        const target = this.store.collectionForObjectKey(relationship.references.objectKey);
        if (!target) continue;
        const sourceField = relationship.fields[0]!;

        for (const [recordId, record] of [...source.entries()]) {
          const referencedId = record[sourceField];
          if (referencedId === null || referencedId === undefined || referencedId === '') continue;
          if (typeof referencedId !== 'string' || target.has(referencedId)) continue;

          const policy = relationship.policies?.delete ?? { action: 'restrict' as const };
          if (policy.action === 'retain') {
            // Semantic/non-destructive relationships may legitimately outlive
            // their target configuration (for example an External Identity
            // retained while its provider configuration is removed).
            continue;
          }
          if (policy.action === 'cascade' || policy.action === 'unlink') {
            source.delete(recordId);
            repaired += 1;
            continue;
          }
          if (policy.action === 'set-null') {
            for (const field of relationship.fields) record[field] = null;
            repaired += 1;
            continue;
          }

          unresolved.push({
            objectKey: metadata.key,
            recordId,
            relationship: relationshipKey,
            referencedObjectKey: relationship.references.objectKey,
          });
        }
      }
    }

    return { repaired, unresolved };
  }

  private applyRecursive(targetObjectKey: string, targetId: string, active: Set<string>): void {
    const visitKey = `${targetObjectKey}:${targetId}`;
    if (active.has(visitKey)) return;
    active.add(visitKey);

    try {
      for (const entry of this.referencesTo(targetObjectKey)) {
        const collection = this.store.collectionForObjectKey(entry.metadata.key);
        if (!collection) continue;

        const matching = [...collection.entries()].filter(([, record]) =>
          this.matchesTarget(record, entry.relationship, targetObjectKey, targetId),
        );
        if (matching.length === 0) continue;

        const policy = entry.relationship.policies?.delete ?? {
          action: 'restrict' as const,
          confirmation: 'inherit' as const,
        };
        if (policy.action === 'restrict') {
          throw new ConflictError(
            'DELETE_RESTRICTED_BY_RELATIONSHIP',
            `Delete blocked by ${entry.metadata.pluralName}.`,
            `${matching.length} related ${entry.metadata.pluralName} reference this record through '${entry.relationshipKey}'.`,
          );
        }

        for (const [dependentId, record] of matching) {
          if (policy.action === 'retain') {
            // Semantic/non-destructive relationships may legitimately outlive
            // their target configuration (for example an External Identity
            // retained while its provider configuration is removed).
            continue;
          }
          if (policy.action === 'cascade' || policy.action === 'unlink') {
            this.applyRecursive(entry.metadata.key, dependentId, active);
            collection.delete(dependentId);
            continue;
          }

          if (policy.action === 'set-null') {
            for (const field of entry.relationship.fields) record[field] = null;
          }
        }
      }
    } finally {
      active.delete(visitKey);
    }
  }

  private directImpacts(targetObjectKey: string, targetId: string): DeleteImpactItem[] {
    const result: DeleteImpactItem[] = [];
    for (const entry of this.referencesTo(targetObjectKey)) {
      const collection = this.store.collectionForObjectKey(entry.metadata.key);
      if (!collection) continue;
      const count = [...collection.values()].filter((record) =>
        this.matchesTarget(record, entry.relationship, targetObjectKey, targetId),
      ).length;
      if (count === 0) continue;

      const policy = entry.relationship.policies?.delete ?? {
        action: 'restrict' as const,
        confirmation: 'inherit' as const,
      };
      result.push({
        objectKey: entry.metadata.key,
        objectName: entry.metadata.pluralName,
        relationship: entry.relationshipKey,
        count,
        action: policy.action,
        confirmation: policy.confirmation ?? 'inherit',
      });
    }
    return result;
  }

  private referencesTo(targetObjectKey: string): Array<{
    metadata: ObjectMetadata;
    relationshipKey: string;
    relationship: ManatOSRelationshipMetadata;
  }> {
    const result: Array<{
      metadata: ObjectMetadata;
      relationshipKey: string;
      relationship: ManatOSRelationshipMetadata;
    }> = [];

    for (const metadata of Object.values(allManatOSObjectMetadata) as ObjectMetadata[]) {
      for (const [relationshipKey, relationship] of Object.entries(metadata.relationships ?? {})) {
        if (relationship.references.objectKey === targetObjectKey) {
          result.push({ metadata, relationshipKey, relationship });
        }
      }
    }
    return result;
  }

  private matchesTarget(
    record: Record<string, unknown>,
    relationship: ManatOSRelationshipMetadata,
    targetObjectKey: string,
    targetId: string,
  ): boolean {
    if (
      relationship.fields.length !== relationship.references.fields.length ||
      relationship.fields.length === 0
    ) {
      return false;
    }

    const targetCollection = this.store.collectionForObjectKey(targetObjectKey);
    const targetRecord = targetCollection?.get(targetId);
    if (!targetRecord) return false;

    return relationship.fields.every((sourceField, index) => {
      const referencedField = relationship.references.fields[index]!;
      return record[sourceField] === targetRecord[referencedField];
    });
  }
}
