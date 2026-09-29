import {
  ConflictError,
  allManatOSObjectMetadata,
  allManatOSRelationshipDefinitions,
  relationshipCandidateMatches,
  relationshipEndpointIsSet,
  relationshipsReferencing,
  type ResolvedRelationshipDefinition,
  type ManatOSRelationshipDeleteAction,
  type ManatOSRelationshipConfirmationPolicy,
} from '@manatos/shared';

import type { InMemoryDataStore } from '../../storage/in-memory-data-store.js';

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

    for (const definition of allManatOSRelationshipDefinitions) {
      const source = this.store.collectionForObjectKey(definition.sourceObjectKey);
      const target = this.store.collectionForObjectKey(definition.targetObjectKey);
      if (!source || !target) continue;
      const targetRecords = [...target.values()];

      for (const [recordId, record] of [...source.entries()]) {
        if (!relationshipEndpointIsSet(definition, 'forward', record)) continue;
        const targetExists = targetRecords.some((candidate) =>
          relationshipCandidateMatches(definition, 'forward', record, candidate),
        );
        if (targetExists) continue;

        const policy = definition.relationship.policies?.delete ?? { action: 'restrict' as const };
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
          for (const field of definition.relationship.fields) record[field] = null;
          repaired += 1;
          continue;
        }

        unresolved.push({
          objectKey: definition.sourceObjectKey,
          recordId,
          relationship: definition.key,
          referencedObjectKey: definition.targetObjectKey,
        });
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
        const collection = this.store.collectionForObjectKey(entry.sourceObjectKey);
        if (!collection) continue;

        const matching = this.matchingEntries(entry, targetObjectKey, targetId);
        if (matching.length === 0) continue;

        const policy = entry.relationship.policies?.delete ?? {
          action: 'restrict' as const,
          confirmation: 'inherit' as const,
        };
        if (policy.action === 'restrict') {
          throw new ConflictError(
            'DELETE_RESTRICTED_BY_RELATIONSHIP',
            `Delete blocked by ${(entry.source as ObjectMetadata).pluralLabel}.`,
            `${matching.length} related ${(entry.source as ObjectMetadata).pluralLabel} reference this record through '${entry.key}'.`,
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
            this.applyRecursive(entry.sourceObjectKey, dependentId, active);
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
      const collection = this.store.collectionForObjectKey(entry.sourceObjectKey);
      if (!collection) continue;
      const count = this.matchingEntries(entry, targetObjectKey, targetId).length;
      if (count === 0) continue;

      const policy = entry.relationship.policies?.delete ?? {
        action: 'restrict' as const,
        confirmation: 'inherit' as const,
      };
      result.push({
        objectKey: entry.sourceObjectKey,
        objectName: (entry.source as ObjectMetadata).pluralLabel,
        relationship: entry.key,
        count,
        action: policy.action,
        confirmation: policy.confirmation ?? 'inherit',
      });
    }
    return result;
  }

  private referencesTo(targetObjectKey: string): readonly ResolvedRelationshipDefinition[] {
    return relationshipsReferencing(allManatOSRelationshipDefinitions, targetObjectKey);
  }

  private matchingEntries(
    definition: ResolvedRelationshipDefinition,
    targetObjectKey: string,
    targetId: string,
  ): Array<[string, Record<string, unknown>]> {
    const source = this.store.collectionForObjectKey(definition.sourceObjectKey);
    const target = this.store.collectionForObjectKey(targetObjectKey);
    const targetRecord = target?.get(targetId);
    if (!source || !targetRecord) return [];

    return [...source.entries()].filter(([, record]) =>
      relationshipCandidateMatches(definition, 'inverse', targetRecord, record),
    );
  }
}
