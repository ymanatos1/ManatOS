import type { Request } from 'express';

import {
  entryTypeSource,
  resolveSysBOUIListView,
  type ManatOSContext,
  type SysBOMetadata,
  type SysBOUIMetadata,
} from '@manatos/shared';

import { apiClient } from '../../../api/client.js';
import { apiSessionOptions } from '../../../auth/api-session.js';
import { entityContextName } from '../../../context/manatos-context.js';
import type {
  EntityListDataSource,
  EntityListQuery,
  EntityListSelectionMode,
} from '../../../runtime/list/entity-list-contracts.js';
import { EntityListRuntime } from '../../../runtime/list/entity-list-runtime.js';
import { entityListQueryParams } from '../../../runtime/list/entity-list-query.js';
import { createCalculatedRecordProjector } from '../../../runtime/projection/calculated-record-projector.js';
import type { SysBODefinition } from '../../../sysbo/types.js';
import { apiPathFor, references, type SysBOListData } from './data-access.js';

export interface SysBOListResourceOptions {
  readonly purpose: string;
}

export interface SysBOEntityListRuntimeOptions extends SysBOListResourceOptions {
  readonly metadataUI: SysBOUIMetadata;
  readonly viewKey: string;
  readonly query: EntityListQuery;
  readonly selectionMode?: EntityListSelectionMode;
}

/** Build the canonical EntityList runtime definition from resolved SysBO metadata/query state. */
export function sysBOEntityListRuntime(
  req: Request,
  definition: SysBODefinition,
  metadata: SysBOMetadata<Record<string, unknown>>,
  ctx: ManatOSContext,
  options: SysBOEntityListRuntimeOptions,
): EntityListRuntime<Record<string, unknown>> {
  const viewKey = options.viewKey;
  const listMetadata = resolveSysBOUIListView(options.metadataUI, viewKey).metadata;

  return new EntityListRuntime<Record<string, unknown>>({
    entityKey: definition.key,
    idField: 'id',
    viewKey,
    columns: listMetadata.visibleFields.map((field) => ({
      field,
      label: metadata.fieldDefinition[field]?.label ?? field,
      sortable: listMetadata.sortableFields.includes(field),
      filterable: listMetadata.filterFields.includes(field),
    })),
    selectionMode: options.selectionMode ?? 'none',
    initialQuery: options.query,
    dataSource: sysBOEntityListDataSource(req, definition, metadata, ctx, options),
  });
}

/**
 * Canonical server-side adapter from the host-neutral EntityList query contract
 * to the SysBO HTTP API. Record projection happens at this boundary so every
 * list consumer receives the same metadata-complete row shape.
 */
export function sysBOEntityListDataSource(
  req: Request,
  definition: SysBODefinition,
  metadata: SysBOMetadata<Record<string, unknown>>,
  ctx: ManatOSContext | undefined,
  options: SysBOListResourceOptions,
): EntityListDataSource<Record<string, unknown>> {
  const project = ctx
    ? createCalculatedRecordProjector(metadata, ctx, {
        source: 'entity-list-runtime',
        sourcePath: `ctx.entities.${entityContextName(metadata.key)}`,
        purpose: options.purpose,
      })
    : undefined;

  return {
    load: async (query: EntityListQuery) => {
      const response = await apiClient.get<SysBOListData<Record<string, unknown>>>(
        `/api/v1/${apiPathFor(definition.key)}?${entityListQueryParams(query).toString()}`,
        apiSessionOptions(req),
      );
      return {
        items: project
          ? await Promise.all(response.data.items.map((item) => project(item)))
          : response.data.items,
        paging: response.data.paging,
      };
    },
  };
}

/** Fields/resources needed to present one resolved metadata list view. */
export function sysBOListReferenceFieldKeys(
  metadata: SysBOMetadata<Record<string, unknown>>,
  metadataUI: SysBOUIMetadata,
  viewKey = 'main',
): { readonly fieldKeys: readonly string[]; readonly entryUsesRelations: boolean } {
  const listMetadata = resolveSysBOUIListView(metadataUI, viewKey).metadata;
  const entryType = entryTypeSource<Record<string, unknown>>(metadata);
  const entryTypeField =
    entryType && 'field' in entryType
      ? entryType.field
      : entryType &&
          'expression' in entryType &&
          /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entryType.expression.trim())
        ? entryType.expression.trim()
        : null;
  const entryUsesRelations = Object.values(metadata.entry ?? {}).some(
    (source) => source && 'expression' in source && source.expression.includes('relations.'),
  );

  return {
    fieldKeys: [
      ...new Set([
        ...listMetadata.visibleFields,
        ...listMetadata.filterFields,
        ...(entryTypeField ? [entryTypeField] : []),
      ]),
    ],
    entryUsesRelations,
  };
}

/**
 * Hydrate factual reference catalogues required by list presentation. This is
 * shared by browse lists and parent-list snapshots so neither host reconstructs
 * relationship/resource requirements independently.
 */
export async function sysBOListReferenceData(
  req: Request,
  definition: SysBODefinition,
  metadata: SysBOMetadata<Record<string, unknown>>,
  metadataUI: SysBOUIMetadata,
  ctx: ManatOSContext,
  viewKey = 'main',
): Promise<Record<string, Readonly<Record<string, unknown>>[]>> {
  const { fieldKeys, entryUsesRelations } = sysBOListReferenceFieldKeys(
    metadata,
    metadataUI,
    viewKey,
  );
  const needsReferences =
    fieldKeys.some((fieldKey) => metadata.fieldDefinition[fieldKey]?.type === 'reference') ||
    entryUsesRelations;
  if (!needsReferences) return {};

  return references(req, definition, {
    ctx,
    ...(entryUsesRelations ? {} : { fieldKeys }),
  });
}
