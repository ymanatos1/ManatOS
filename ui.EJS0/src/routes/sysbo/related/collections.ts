import type { Request } from 'express';

import {
  allManatOSObjectMetadata,
  relationshipForField,
  type ManatOSContext,
  type ManatOSObjectMetadata,
  type SysBOMetadata,
  type SysBOUIMetadata,
} from '@manatos/shared';

import { getSysBODefinition } from '../../../sysbo/definitions.js';
import { entityContextName } from '../../../context/manatos-context.js';
import { createCalculatedRecordProjector } from '../../../runtime/projection/calculated-record-projector.js';
import { references } from '../shared/data-access.js';
import { sysBOEntityListDataSource } from '../shared/list-resource.js';
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
  requestedCollectionKeys?: ReadonlySet<string>,
  readOnlyPresentation = false,
): Promise<RelatedCollectionData> {
  const collectionResourceData: Record<string, RelatedCollectionResourceData> = Object.fromEntries(
    Object.entries(initialCollectionResourceRows).map(([sourceKey, rows]) => [
      sourceKey,
      { rows: [...rows], references: {} },
    ]),
  );
  const editableCollectionSources = collectionEditorSourceKeys(effectiveUIMetadata);
  const collectionRequested = (collectionKey: string) =>
    !requestedCollectionKeys || requestedCollectionKeys.has(collectionKey);

  // Caller-supplied factual rows cross the same canonical projection boundary as
  // entity-query rows. This prevents custom resource loaders from becoming a
  // second presentation/calculation path for related records.
  if (ctx) {
    for (const [collectionKey, collection] of Object.entries(
      effectiveUIMetadata?.record.relatedCollections ?? {},
    )) {
      if (!collectionRequested(collectionKey)) continue;
      const sourceKey = collection.sourceKey ?? collectionKey;
      const resource = collectionResourceData[sourceKey];
      if (!resource || resource.rows.length === 0) continue;
      const relatedMetadata = allManatOSObjectMetadata[
        collection.entityKey as keyof typeof allManatOSObjectMetadata
      ] as ManatOSObjectMetadata<Record<string, unknown>> | undefined;
      if (!relatedMetadata) continue;
      const project = createCalculatedRecordProjector(relatedMetadata, ctx, {
        source: 'entity-list-runtime',
        sourcePath: `ctx.entities.${entityContextName(collection.entityKey)}`,
        purpose: 'project caller-supplied related-collection record field',
      });
      resource.rows = await Promise.all(
        resource.rows.map((row) => project(row as Readonly<Record<string, unknown>>)),
      );
    }
  }

  if (isNew) {
    return { collectionResourceData };
  }

  for (const [collectionKey, collection] of Object.entries(
    effectiveUIMetadata?.record.relatedCollections ?? {},
  )) {
    if (!collectionRequested(collectionKey)) continue;
    if (collection.source?.kind !== 'entity-query') continue;

    const currentField = collection.source.currentField ?? 'id';
    const filterValue = item[currentField];
    const sourceKey = collection.sourceKey ?? collectionKey;
    if (filterValue === undefined || filterValue === null || filterValue === '') {
      collectionResourceData[sourceKey] = { rows: [], references: {} };
      continue;
    }

    const relatedDefinition = getSysBODefinition(collection.entityKey);
    const relatedPage = await sysBOEntityListDataSource(
      req,
      relatedDefinition,
      relatedDefinition.boMetadata as unknown as SysBOMetadata<Record<string, unknown>>,
      ctx,
      { purpose: 'project calculated related-collection record field' },
    ).load({
      page: 1,
      pageSize: collection.source.pageSize ?? 100,
      direction: collection.source.direction === 'desc' ? 'desc' : 'asc',
      filters: { [collection.source.filterField]: String(filterValue) },
      ...(collection.source.sort ? { sort: collection.source.sort } : {}),
    });
    const completeRelatedRows = [...relatedPage.items];
    /*
     * A relationship may query junction rows while presenting the referenced
     * entity (relatedEntityKey). Resource planning must therefore distinguish
     * the persistence row shape from the presentation row shape. Resolve the
     * bridge reference once here so every surface (page, popup, full, quick)
     * receives the same canonical target records.
     */
    const presentationEntityKey = collection.relatedEntityKey ?? collection.entityKey;
    const presentationDefinition = getSysBODefinition(presentationEntityKey);
    const bridgeReferenceField =
      presentationEntityKey !== collection.entityKey
        ? Object.values(relatedDefinition.boMetadata.fieldDefinition).find(
            (field) =>
              relationshipForField(relatedDefinition.boMetadata, field.key)?.relationship.references
                .objectKey === presentationEntityKey,
          )?.key
        : undefined;

    let presentationRows = completeRelatedRows;
    if (bridgeReferenceField) {
      const bridgeIds = completeRelatedRows
        .map((row) => row[bridgeReferenceField])
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
      const bridgeReferences = await references(req, relatedDefinition, {
        ctx,
        fieldKeys: [bridgeReferenceField],
        selectionOnly: true,
        selectedIdsByField: { [bridgeReferenceField]: bridgeIds },
      });
      const targets = (bridgeReferences[bridgeReferenceField] ?? []) as Record<string, unknown>[];
      presentationRows = completeRelatedRows.flatMap((relationshipRow) => {
        const targetId = relationshipRow[bridgeReferenceField];
        const target = targets.find(
          (candidate) => String(candidate?.value ?? candidate?.id ?? '') === String(targetId ?? ''),
        );
        if (!target || typeof target !== 'object') return [];
        // Preserve relationship identity privately for editors/reconciliation while
        // keeping ordinary field presentation entirely target-entity shaped.
        return [
          {
            ...target,
            [bridgeReferenceField]: targetId,
            __relationshipId: relationshipRow.id ?? null,
          },
        ];
      });
    }

    collectionResourceData[sourceKey] = { rows: presentationRows, references: {} };

    /*
     * Displayed reference fields belong to the presentation entity, not
     * necessarily the queried relationship entity. Hydrate only those demanded
     * by the resolved related-list view.
     */
    const collectionFieldKeys = Object.keys(collection.fields || {});
    const referenceFieldKeys = collectionFieldKeys.filter((fieldKey) =>
      relationshipForField(presentationDefinition.boMetadata, fieldKey),
    );
    if (referenceFieldKeys.length > 0) {
      const selectedIdsByField = readOnlyPresentation
        ? Object.fromEntries(
            referenceFieldKeys.map((fieldKey) => [
              fieldKey,
              presentationRows
                .map((row) => row[fieldKey])
                .filter((value): value is string => typeof value === 'string' && value.length > 0),
            ]),
          )
        : undefined;
      collectionResourceData[sourceKey].references = await references(req, presentationDefinition, {
        ctx,
        fieldKeys: referenceFieldKeys,
        selectionOnly: readOnlyPresentation,
        ...(selectedIdsByField ? { selectedIdsByField } : {}),
      });
    }

    // Editors consume the same presentation rows. No second contact-specific
    // junction-to-target hydration path is allowed here.
    if (!editableCollectionSources.has(sourceKey)) continue;
  }

  return { collectionResourceData };
}
