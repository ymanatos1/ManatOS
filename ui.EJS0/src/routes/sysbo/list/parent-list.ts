import type { Request } from 'express';

import {
  resolveSysBOUIListView,
  type ManatOSContext,
  type SysBOMetadata,
  type SysBOUIMetadata,
} from '@manatos/shared';

import type { SysBODefinition } from '../../../sysbo/types.js';
import { metadataDrivenListQuery, metadataEntrySearchField } from './query.js';
import { listPresentationDefinition } from './presentation.js';
import { sysBOEntityListRuntime, sysBOListReferenceData } from '../shared/list-resource.js';

export interface ParentListPermissions {
  read: boolean;
  create: boolean;
  update: boolean;
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
  ctx: ManatOSContext,
): Promise<Readonly<Record<string, unknown>>> {
  const sourceQuery = parentListQueryForEntry(req, definition);
  const listQuery = metadataDrivenListQuery(
    req,
    metadataUI,
    sourceQuery,
    metadataEntrySearchField(metadata),
  );
  const runtime = sysBOEntityListRuntime(req, definition, metadata, ctx, {
    metadataUI,
    viewKey: listQuery.viewKey,
    query: listQuery.query,
    purpose: 'project calculated parent-list record field',
  });
  const snapshot = await runtime.load();
  const referenceData = await sysBOListReferenceData(
    req,
    definition,
    metadata,
    metadataUI,
    ctx,
    snapshot.definition.viewKey,
  );

  return {
    items: [...snapshot.entries],
    paging: snapshot.paging,
    query: { ...listQuery.query, pageSize: snapshot.paging.pageSize },
    permissions,
    referenceData,
    presentationDefinition: listPresentationDefinition(
      resolveSysBOUIListView(metadataUI, listQuery.viewKey).metadata,
    ),
  };
}
