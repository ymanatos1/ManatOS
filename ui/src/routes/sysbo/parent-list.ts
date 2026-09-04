import type { Request } from 'express';

import { entryTypeSource, type SysBOMetadata, type SysBOUIMetadata } from '@manatos/shared';

import { apiClient } from '../../api/client.js';
import { apiSessionOptions } from '../../auth/api-session.js';
import type { SysBODefinition } from '../../sysbo/types.js';
import { apiPathFor, references, type SysBOListData } from './data-access.js';
import { metadataDrivenListQuery, metadataEntrySearchField } from './list-query.js';

export interface ParentListPermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

/**
 * Recover the list URL that logically owns an entry page.
 *
 * Same-origin navigation supplies the exact list paging/sort/filter state.
 * Direct entry URLs have no parent browser page and therefore use list
 * defaults. This keeps parent-list CTX state tied to its real navigation
 * context instead of persisting it globally.
 */
function parentListQueryForEntry(
  req: Request,
  definition: SysBODefinition,
): Record<string, string> {
  const referrer = req.get('referer');
  if (!referrer) return {};

  try {
    const origin = `${req.protocol}://${req.get('host')}`;
    const url = new URL(referrer, origin);
    if (url.origin !== origin || url.pathname !== `/bo/${definition.key}`) return {};
    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}

/** Load the parent list snapshot before the child entry CTX node is created. */
export async function parentListContextForEntry(
  req: Request,
  definition: SysBODefinition,
  metadata: SysBOMetadata<Record<string, unknown>>,
  metadataUI: SysBOUIMetadata,
  permissions: ParentListPermissions,
): Promise<Readonly<Record<string, unknown>>> {
  const sourceQuery = parentListQueryForEntry(req, definition);
  const listQuery = metadataDrivenListQuery(
    req,
    metadataUI,
    sourceQuery,
    metadataEntrySearchField(metadata),
  );
  const response = await apiClient.get<SysBOListData<Record<string, unknown>>>(
    `/api/v1/${apiPathFor(definition.key)}?${listQuery.params.toString()}`,
    apiSessionOptions(req),
  );

  const entryType = entryTypeSource<Record<string, unknown>>(metadata);
  const entryTypeField = entryType && 'field' in entryType
    ? entryType.field
    : (entryType && 'expression' in entryType && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entryType.expression.trim())
        ? entryType.expression.trim()
        : null);
  const entryUsesRelations = Object.values(metadata.entry ?? {}).some(
    (source) => source && 'expression' in source && source.expression.includes('relations.'),
  );
  const referenceFields = [...new Set([
    ...metadataUI.list.visibleFields,
    ...metadataUI.list.filterFields,
    ...(entryTypeField ? [entryTypeField] : []),
  ])];
  const referenceData = referenceFields.some(
    (fieldKey) => metadata.fieldDefinition[fieldKey]?.type === 'reference',
  ) || entryUsesRelations
    ? await references(req, definition)
    : {};

  return {
    items: response.data.items,
    paging: response.data.paging,
    query: { ...listQuery.query, pageSize: String(response.data.paging.pageSize) },
    permissions,
    referenceData,
  };
}
