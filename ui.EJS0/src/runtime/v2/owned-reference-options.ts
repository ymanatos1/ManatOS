import { relationshipForField, type ManatOSObjectMetadata } from '@manatos/shared/metadata/bo';
import type { SysBOUIMetadata } from '@manatos/shared/metadata/ui';
import { resolveEntryRepresentation } from '@manatos/shared/presentation/entry-representation';

import type { UiOwnerEntryProjection } from './surface-providers.js';

export const OWNER_WORKSPACE_OPTION_STATE = 'owner-workspace';

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;

const identityOf = (value: Readonly<Record<string, unknown>>): string =>
  String(value.id ?? value.value ?? '');

export function referenceTargetEntityKey(
  sourceMetadata: ManatOSObjectMetadata<Record<string, unknown>>,
  fieldKey: string,
): string | null {
  const relationship = relationshipForField(sourceMetadata, fieldKey);
  if (relationship?.relationship.references.objectKey)
    return relationship.relationship.references.objectKey;

  const field = sourceMetadata.fieldDefinition[fieldKey];
  const inverse = field?.inverseRelationship;
  return inverse?.objectKey ?? null;
}

/**
 * Overlay one target entity's owner-workspace mutations onto the factual reference
 * catalogue. This is the sole owned-entry augmentation of the canonical field
 * option domain; ordinary entries keep their base options byte-for-byte semantic.
 */
export function ownedReferenceOptions(
  baseOptions: readonly Readonly<Record<string, unknown>>[],
  ownerEntries: readonly UiOwnerEntryProjection[],
  metadata: ManatOSObjectMetadata<Record<string, unknown>>,
  uiMetadata: SysBOUIMetadata | null | undefined,
  entityIcon: string | null,
): readonly Readonly<Record<string, unknown>>[] {
  const options = new Map<string, Readonly<Record<string, unknown>>>();
  for (const candidate of baseOptions) {
    const id = identityOf(candidate);
    if (id) options.set(id, { ...candidate });
  }

  for (const entry of ownerEntries) {
    if (entry.deleted || !entry.current) {
      options.delete(entry.identity);
      continue;
    }

    const baseline = options.get(entry.identity) ?? {};
    const current = record(entry.current) ?? {};
    const effectiveRecord = { ...baseline, ...current, id: entry.identity };
    const representation = resolveEntryRepresentation(metadata, uiMetadata, effectiveRecord, {
      entityIcon,
    });
    const name = representation.name || String(entry.identity);
    options.set(
      entry.identity,
      Object.freeze({
        ...effectiveRecord,
        value: entry.identity,
        label: name,
        __entryName: name,
        __entryIcons: representation.icons,
        __entryIcon: representation.icons.at(-1) ?? null,
        ...(entityIcon ? { __entityIcon: entityIcon.replace(/^bi-/, '') } : {}),
        __ownerWorkspaceState: OWNER_WORKSPACE_OPTION_STATE,
      }),
    );
  }

  return Object.freeze([...options.values()]);
}
