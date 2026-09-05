import type { Request } from 'express';

import { apiClient } from '../../api/client.js';
import { apiSessionOptions } from '../../auth/api-session.js';
import { metadataHierarchyWorkspaceDescriptor } from '../../presentation/metadata-hierarchy-workspace.js';
import type { SysBODefinition } from '../../sysbo/types.js';
import { apiPathFor, canonicalSysBOMetadata, canonicalSysBOUIMetadata } from './data-access.js';

/**
 * Persist one metadata-driven hierarchy aggregate and derive the committed root
 * from the same canonical hierarchy descriptor used by the UI workspace.
 *
 * The HTTP route remains responsible for authorization and response delivery;
 * this module owns only the aggregate-write protocol and result projection.
 */
export async function commitMetadataDrivenHierarchy(
  req: Request,
  definition: SysBODefinition,
): Promise<{
  items: Record<string, unknown>[];
  idMap: Record<string, string>;
  rootId: string;
}> {
  const entries = Array.isArray(req.body?.entries)
    ? req.body.entries.filter(
        (row: unknown): row is Record<string, unknown> =>
          Boolean(row) && typeof row === 'object' && !Array.isArray(row),
      )
    : [];
  const entriesOriginal = Array.isArray(req.body?.entriesOriginal)
    ? req.body.entriesOriginal.filter(
        (row: unknown): row is Record<string, unknown> =>
          Boolean(row) && typeof row === 'object' && !Array.isArray(row),
      )
    : [];
  const identityField = String(req.body?.identityField || 'id');

  const committed = await apiClient.post<{
    items?: Record<string, unknown>[];
    idMap?: Record<string, string>;
  }>(
    `/api/v1/${apiPathFor(definition.key)}/$aggregate-commit`,
    { entries, entriesOriginal, identityField },
    apiSessionOptions(req),
  );

  const items = Array.isArray(committed.data.items) ? committed.data.items : [];
  const [metadata, metadataUI] = await Promise.all([
    canonicalSysBOMetadata(req, definition),
    canonicalSysBOUIMetadata(req, definition),
  ]);
  const descriptor = metadataHierarchyWorkspaceDescriptor(metadata, metadataUI);
  const root = descriptor
    ? items.find(
        (row) =>
          row[descriptor.parentField] == null || String(row[descriptor.parentField] ?? '') === '',
      )
    : null;

  return {
    items,
    idMap: committed.data.idMap ?? {},
    rootId: root && descriptor ? String(root[descriptor.idField] ?? '') : '',
  };
}
