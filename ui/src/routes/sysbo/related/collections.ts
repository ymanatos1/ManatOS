import type { Request } from 'express';

import type { ManatOSContext, SysBOUIMetadata } from '@manatos/shared';

import { apiClient } from '../../../api/client.js';
import { apiSessionOptions } from '../../../auth/api-session.js';
import { getSysBODefinition } from '../../../sysbo/definitions.js';
import { entityContextName } from '../../../context/manatos-context.js';
import { createCalculatedRecordProjector } from '../../../runtime/projection/calculated-record-projector.js';
import { apiPathFor, references, type SysBOListData } from '../shared/data-access.js';
import { collectionEditorSourceKeys } from './collection-editor-metadata.js';

export interface RelatedCollectionResourceData {
  rows: unknown[];
  references: Record<string, unknown[]>;
}

export interface RelatedCollectionData {
  /** One authoritative component resource per source key: rows plus its factual catalogues. */
  collectionResourceData: Record<string, RelatedCollectionResourceData>;
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
  initialCollectionResourceRows: Readonly<Record<string, unknown[]>> = {},
  ctx?: ManatOSContext,
): Promise<RelatedCollectionData> {
  const collectionResourceData: Record<string, RelatedCollectionResourceData> = Object.fromEntries(
    Object.entries(initialCollectionResourceRows).map(([sourceKey, rows]) => [
      sourceKey,
      { rows: [...rows], references: {} },
    ]),
  );
  const editableCollectionSources = collectionEditorSourceKeys(effectiveUIMetadata);

  if (isNew) {
    return { collectionResourceData };
  }

  for (const [collectionKey, collection] of Object.entries(
    effectiveUIMetadata?.record.relatedCollections ?? {},
  )) {
    if (collection.source?.kind !== 'entity-query') continue;

    const currentField = collection.source.currentField ?? 'id';
    const filterValue = item[currentField];
    const sourceKey = collection.sourceKey ?? collectionKey;
    if (filterValue === undefined || filterValue === null || filterValue === '') {
      collectionResourceData[sourceKey] = { rows: [], references: {} };
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
    /*
     * Publish the canonical metadata-backed row projection into V2 CTX. The shared
     * projector owns both calculated-field materialization and metadata-shape closing;
     * this route owns only resource loading.
     */
    const completeRelatedRows = ctx
      ? await Promise.all(
          response.data.items.map(
            createCalculatedRecordProjector(relatedDefinition.boMetadata, ctx, {
              source: 'entity-list-runtime',
              sourcePath: `ctx.entities.${entityContextName(relatedDefinition.key)}`,
              purpose: 'project calculated related-collection record field',
            }),
          ),
        )
      : response.data.items;
    // Read-only is the default authoritative resource shape. A declared editor
    // may replace it below with its explicit working-record projection.
    collectionResourceData[sourceKey] = { rows: completeRelatedRows, references: {} };

    const needsReferenceData = Object.keys(collection.fields || {}).some(
      (fieldKey) => relatedDefinition.boMetadata.fieldDefinition[fieldKey]?.type === 'reference',
    );
    if (!needsReferenceData) continue;

    const referenceData = await references(req, relatedDefinition, { ctx });
    collectionResourceData[sourceKey].references = referenceData;

    // Reference catalogues can be required for read-only presentation as well.
    // Only a declared collection-editor may replace the query row with its richer
    // referenced-record editing projection.
    if (!editableCollectionSources.has(sourceKey)) continue;

    /*
     * Relationship rows carry persistence ids while the collection editor
     * works with the canonical referenced child records. Hydrate that editing
     * buffer generically from the collection's reference field and preserve
     * the relationship-target id for subsequent save reconciliation.
     */
    const referenceFields = collectionResourceData[sourceKey].references;
    const referenceField = Object.keys(collection.fields || {}).find(
      (fieldKey) => relatedDefinition.boMetadata.fieldDefinition[fieldKey]?.type === 'reference',
    );
    if (!referenceField) continue;

    const refs = (referenceFields?.[referenceField] ?? []) as Record<string, unknown>[];
    collectionResourceData[sourceKey].rows = completeRelatedRows
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

  return { collectionResourceData };
}
