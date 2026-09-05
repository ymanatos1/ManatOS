import type { Request } from 'express';

import type { SysBOUIMetadata } from '@manatos/shared';

import { apiClient } from '../../api/client.js';
import { apiSessionOptions } from '../../auth/api-session.js';
import { getSysBODefinition } from '../../sysbo/definitions.js';
import { apiPathFor, references, type SysBOListData } from './data-access.js';

export interface RelatedCollectionData {
  relatedData: Record<string, unknown[]>;
  relatedReferenceData: Record<string, Record<string, unknown[]>>;
  relatedEditingData: Record<string, unknown[]>;
}

/**
 * Load metadata-declared related collections for one entry page.
 *
 * This loader deliberately knows nothing about Principal Contact, email,
 * telephone or address entities. The owning record metadata supplies the
 * related SysBO, filter field, source key, paging and sort contract.
 */
export async function loadRelatedCollections(
  req: Request,
  item: Readonly<Record<string, unknown>>,
  isNew: boolean,
  effectiveUIMetadata?: SysBOUIMetadata,
  initialRelatedData: Readonly<Record<string, unknown[]>> = {},
): Promise<RelatedCollectionData> {
  const relatedData: Record<string, unknown[]> = { ...initialRelatedData };
  const relatedReferenceData: Record<string, Record<string, unknown[]>> = {};
  const relatedEditingData: Record<string, unknown[]> = {};

  if (isNew) {
    return { relatedData, relatedReferenceData, relatedEditingData };
  }

  for (const [collectionKey, collection] of Object.entries(
    effectiveUIMetadata?.record.relatedCollections ?? {},
  )) {
    if (collection.source?.kind !== 'entity-query') continue;

    const currentField = collection.source.currentField ?? 'id';
    const filterValue = item[currentField];
    const sourceKey = collection.sourceKey ?? collectionKey;
    if (filterValue === undefined || filterValue === null || filterValue === '') {
      relatedData[sourceKey] = [];
      continue;
    }

    const relatedDefinition = getSysBODefinition(collection.entityKey);
    const params = new URLSearchParams({
      page: '1',
      pageSize: String(collection.source.pageSize ?? 100),
      [`filter.${collection.source.filterField}`]: String(filterValue),
    });
    if (collection.source.sort) params.set('sort', collection.source.sort);
    if (collection.source.direction) params.set('direction', collection.source.direction);

    const response = await apiClient.get<SysBOListData<Record<string, unknown>>>(
      `/api/v1/${apiPathFor(relatedDefinition.key)}?${params.toString()}`,
      apiSessionOptions(req),
    );
    relatedData[sourceKey] = response.data.items;

    const needsReferenceData = Object.keys(collection.fields || {}).some(
      (fieldKey) => relatedDefinition.boMetadata.fieldDefinition[fieldKey]?.type === 'reference',
    );
    if (!needsReferenceData) continue;

    relatedReferenceData[sourceKey] = await references(req, relatedDefinition);

    /*
     * Relationship rows carry persistence ids while the collection editor
     * works with the canonical referenced child records. Hydrate that editing
     * buffer generically from the collection's reference field and preserve
     * the relationship-target id for subsequent save reconciliation.
     */
    const referenceFields = relatedReferenceData[sourceKey];
    const referenceField = Object.keys(collection.fields || {}).find(
      (fieldKey) => relatedDefinition.boMetadata.fieldDefinition[fieldKey]?.type === 'reference',
    );
    if (!referenceField) continue;

    const refs = (referenceFields?.[referenceField] ?? []) as Record<string, unknown>[];
    relatedEditingData[sourceKey] = response.data.items
      .map((link) => {
        const targetId = link[referenceField];
        const referenced = refs.find(
          (candidate) => String(candidate?.value ?? candidate?.id ?? '') === String(targetId ?? ''),
        );
        if (!referenced || typeof referenced !== 'object') return null;
        return { ...referenced, [referenceField]: targetId };
      })
      .filter((value): value is Record<string, unknown> => Boolean(value));
  }

  return { relatedData, relatedReferenceData, relatedEditingData };
}
