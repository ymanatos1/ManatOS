import type { Request } from 'express';
import type { SysBOMetadata } from '@manatos/shared';

import { apiClient } from '../../../api/client.js';
import { apiSessionOptions } from '../../../auth/api-session.js';
import type { MetadataHierarchyWorkspaceDescriptor } from '../../../presentation/metadata/hierarchy-workspace.js';
import { hierarchyRootIdForMember } from '../../../presentation/metadata/hierarchy-workspace.js';
import type { SysBODefinition } from '../../../sysbo/types.js';
import { apiPathFor, type SysBOListData } from '../shared/data-access.js';

export interface MetadataHierarchySnapshot {
  readonly focusedMember: Readonly<Record<string, unknown>>;
  readonly rootId: string;
  readonly entries: readonly Readonly<Record<string, unknown>>[];
}

/**
 * Load the complete connected hierarchy containing one persisted member.
 *
 * This is the canonical read model shared by an embedded hierarchy component
 * and the full hierarchy workspace. Callers choose only the host/presentation;
 * hierarchy membership discovery must never depend on the surrounding list
 * page, its filters, its page size, or whichever renderer happens to be active.
 */
export async function loadMetadataHierarchySnapshot(
  req: Request,
  definition: SysBODefinition,
  metadata: SysBOMetadata<Record<string, unknown>>,
  descriptor: MetadataHierarchyWorkspaceDescriptor,
  focused: string | Readonly<Record<string, unknown>>,
): Promise<MetadataHierarchySnapshot> {
  const focusedMember =
    typeof focused === 'string'
      ? await apiClient
          .get<Record<string, unknown>>(
            `/api/v1/${apiPathFor(definition.key)}/${encodeURIComponent(focused)}`,
            apiSessionOptions(req),
          )
          .then((response) => response.data)
      : { ...focused };

  let rootId = hierarchyRootIdForMember(focusedMember, descriptor);
  if (!rootId) {
    throw new Error(`The selected ${metadata.label} does not expose a valid hierarchy identity.`);
  }

  const hierarchyById = new Map<string, Record<string, unknown>>();
  const addRow = (row: Readonly<Record<string, unknown>> | null | undefined) => {
    if (!row) return;
    const id = row[descriptor.idField];
    if (id !== null && id !== undefined && String(id) !== '') {
      hierarchyById.set(String(id), { ...row });
    }
  };

  if (descriptor.rootField) {
    const params = new URLSearchParams({
      page: '1',
      pageSize: '10000',
      sort: descriptor.labelField,
      direction: 'asc',
    });
    params.set(`filter.${descriptor.rootField}`, rootId);

    const focusedId = String(focusedMember[descriptor.idField] ?? '');
    const [membersResponse, rootMember] = await Promise.all([
      apiClient.get<SysBOListData<Record<string, unknown>>>(
        `/api/v1/${apiPathFor(definition.key)}?${params.toString()}`,
        apiSessionOptions(req),
      ),
      focusedId === rootId
        ? Promise.resolve(focusedMember)
        : apiClient
            .get<Record<string, unknown>>(
              `/api/v1/${apiPathFor(definition.key)}/${encodeURIComponent(rootId)}`,
              apiSessionOptions(req),
            )
            .then((response) => response.data),
    ]);

    addRow(rootMember);
    for (const row of membersResponse.data.items) addRow(row);
    addRow(focusedMember);
  } else {
    /*
     * Without a persisted root field, discover the connected tree from one
     * complete entity snapshot using only metadata-declared identity/parent
     * fields. This remains entity-agnostic and storage-adapter neutral.
     */
    const response = await apiClient.get<SysBOListData<Record<string, unknown>>>(
      `/api/v1/${apiPathFor(definition.key)}?page=1&pageSize=10000&sort=${encodeURIComponent(descriptor.labelField)}&direction=asc`,
      apiSessionOptions(req),
    );
    const allById = new Map(
      response.data.items
        .map((row) => [String(row[descriptor.idField] ?? ''), row] as const)
        .filter(([id]) => Boolean(id)),
    );

    let rootCandidate: Readonly<Record<string, unknown>> | null = focusedMember;
    const visited = new Set<string>();
    while (rootCandidate) {
      const currentId = String(rootCandidate[descriptor.idField] ?? '');
      if (!currentId || visited.has(currentId)) break;
      visited.add(currentId);
      const parentId = rootCandidate[descriptor.parentField];
      if (parentId === null || parentId === undefined || String(parentId) === '') break;
      const parent = allById.get(String(parentId));
      if (!parent) break;
      rootCandidate = parent;
    }
    rootId = String(rootCandidate?.[descriptor.idField] ?? rootId);

    const pending = rootId ? [rootId] : [];
    const included = new Set<string>();
    while (pending.length) {
      const id = pending.shift()!;
      if (included.has(id)) continue;
      included.add(id);
      addRow(allById.get(id));
      for (const [candidateId, candidate] of allById) {
        if (String(candidate[descriptor.parentField] ?? '') === id) pending.push(candidateId);
      }
    }
    addRow(focusedMember);
  }

  const entries = [...hierarchyById.values()].sort((left, right) =>
    String(left[descriptor.labelField] ?? '').localeCompare(
      String(right[descriptor.labelField] ?? ''),
      undefined,
      { sensitivity: 'base' },
    ),
  );

  return {
    focusedMember: Object.freeze({ ...focusedMember }),
    rootId,
    entries: Object.freeze(entries.map((entry) => Object.freeze({ ...entry }))),
  };
}
