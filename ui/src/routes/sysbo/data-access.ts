import type { Request } from 'express';

import {
  compileExpression,
  evaluateExpression,
  resolveEntryRepresentation,
  type CompiledExpression,
  type SysBOFieldMetadata,
  type SysBOMetadata,
  type SysBOUIMetadata,
} from '@manatos/shared';

import { apiClient } from '../../api/client.js';
import { apiSessionOptions } from '../../auth/api-session.js';
import { getSysBODefinition } from '../../sysbo/definitions.js';
import { apiPathFor } from '../../sysbo/api-path.js';
import type { SysBODefinition } from '../../sysbo/types.js';

export { apiPathFor } from '../../sysbo/api-path.js';

/** Generic SysBO list payload returned by the API. */
export interface SysBOListData<T> {
  items: T[];
  paging: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  metadata?: unknown;
}

/**
 * Load canonical, UI-neutral SysBO metadata through the API boundary.
 *
 * Generic pages must consume the same canonical metadata exposed externally;
 * they must not grow a private UI-server definition path.
 */
export async function canonicalSysBOMetadata(
  req: Request,
  definition: SysBODefinition,
): Promise<SysBOMetadata<Record<string, unknown>>> {
  const response = await apiClient.get<{ metadata: SysBOMetadata<Record<string, unknown>> }>(
    `/api/v1/${apiPathFor(definition.key)}/$metadata`,
    apiSessionOptions(req),
  );
  return response.data.metadata;
}

/** Load framework-neutral presentation metadata for one SysBO. */
export async function canonicalSysBOUIMetadata(
  req: Request,
  definition: SysBODefinition,
): Promise<SysBOUIMetadata> {
  const response = await apiClient.get<{ metadataUI: SysBOUIMetadata }>(
    `/api/v1/${apiPathFor(definition.key)}/$metadata-ui`,
    apiSessionOptions(req),
  );
  return response.data.metadataUI;
}

export interface ReferenceSelectorContext {
  referenceData: Record<string, Readonly<Record<string, unknown>>[]>;
  queryPredicate: CompiledExpression | null;
}

/** Escape one scalar for the canonical ManatOS expression grammar. */
function expressionStringLiteral(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

/**
 * Build the canonical selector predicate for candidates that are currently
 * unavailable through relationship uniqueness.
 *
 * True means "unavailable". The predicate is compiled once on the server and
 * is safe to expose through CTX/debugger tooling; browser runtimes evaluate the
 * emitted AST and never reparse the source string.
 */
function unavailablePredicate(
  candidates: readonly Readonly<Record<string, unknown>>[],
): CompiledExpression | null {
  const unavailableIds = candidates
    .filter((candidate) => candidate.__referenceUnavailable === true)
    .map((candidate) => candidate.id ?? candidate.value)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  if (!unavailableIds.length) return null;
  return compileExpression(
    `id IN [${unavailableIds.map((value) => expressionStringLiteral(value)).join(', ')}]`,
  );
}

/**
 * Load one target entity's own reference catalogues for use by generic record
 * selectors. This is deliberately entity-aware: if a Principal row contains
 * parentId/rootId, those fields are resolved against Principal metadata and
 * Principal reference catalogues, exactly as on the normal Principal list.
 */
export async function selectorContextForReferenceField(
  req: Request,
  field: SysBOFieldMetadata,
  candidates: readonly Readonly<Record<string, unknown>>[],
): Promise<ReferenceSelectorContext> {
  if (!field.referenceBOKey) {
    return { referenceData: {}, queryPredicate: unavailablePredicate(candidates) };
  }

  let targetDefinition: SysBODefinition;
  try {
    targetDefinition = getSysBODefinition(field.referenceBOKey);
  } catch {
    return { referenceData: {}, queryPredicate: unavailablePredicate(candidates) };
  }

  return {
    referenceData: await references(req, targetDefinition),
    queryPredicate: unavailablePredicate(candidates),
  };
}

/**
 * Load referenced BO values used by reference/select controls.
 *
 * The projection keeps the complete canonical record and adds generic
 * value/label/icon presentation facts. No caller needs entity-specific
 * knowledge of the referenced object's primary display field.
 */
export async function references(
  req: Request,
  definition: SysBODefinition,
): Promise<Record<string, Readonly<Record<string, unknown>>[]>> {
  const output: Record<string, Readonly<Record<string, unknown>>[]> = {};

  for (const field of Object.values(definition.boMetadata.fieldDefinition)) {
    if (!field.referenceBOKey) continue;

    let apiPath: string;
    try {
      apiPath = apiPathFor(field.referenceBOKey);
    } catch {
      continue;
    }

    const response = await apiClient.get<SysBOListData<unknown>>(
      `/api/v1/${apiPath}?pageSize=500&sort=name`,
      apiSessionOptions(req),
    );

    const referencedDefinition = getSysBODefinition(field.referenceBOKey);
    /*
     * Internal/supporting SysBOs intentionally have no standalone UI metadata.
     * Entry representation is fundamentally BO-metadata driven and accepts an
     * absent UI contract, so resolving a reference must never turn an internal
     * entity into a hidden `$metadata-ui` dependency. This is especially
     * important when recursively preparing selector catalogues for entities
     * such as Principal, whose contact junctions are internal SysBOs.
     */
    const referencedUIMetadata =
      referencedDefinition.boMetadata.exposure === 'internal'
        ? undefined
        : await canonicalSysBOUIMetadata(req, referencedDefinition);
    const selection = field.referenceSelection;
    const uniqueThrough = selection?.uniqueThrough;
    let linkedValues = new Set<string>();
    if (uniqueThrough) {
      try {
        const ownerPath = apiPathFor(uniqueThrough.objectKey);
        const ownerResponse = await apiClient.get<SysBOListData<Record<string, unknown>>>(
          `/api/v1/${ownerPath}?pageSize=500&sort=name`,
          apiSessionOptions(req),
        );
        linkedValues = new Set(
          ownerResponse.data.items
            .map((entry) => entry[uniqueThrough.field])
            .filter((value): value is string => typeof value === 'string' && value.length > 0),
        );
      } catch {
        // Candidate hints are advisory only; the API remains authoritative.
      }
    }
    output[field.key] = response.data.items
      .filter((item) => {
        if (!selection?.filterExpression) return true;
        const candidate = item as Record<string, unknown>;
        return Boolean(
          evaluateExpression(selection.filterExpression, candidate, candidate, {
            source: 'reference-selection',
            sourcePath: `${definition.key}.${field.key}.referenceSelection`,
            purpose: 'filter reference candidates',
          }),
        );
      })
      .map((item) => {
        const record = item as Record<string, unknown>;
        const id = record.id;
        const representation = resolveEntryRepresentation(
          referencedDefinition.boMetadata,
          referencedUIMetadata,
          record,
          { entityIcon: referencedDefinition.icon },
        );

        const entryName = representation.name || String(id ?? '');
        return {
          ...record,
          value: id,
          label: entryName,
          __entryName: entryName,
          // Keep the complete canonical entry icon representation so every
          // related-entry control can render the referenced record itself rather
          // than falling back to the referenced entity's page icon. For composed
          // representations (for example Principal entity + Principal type), the
          // order is entity icon first, semantic/type icon second.
          __entryIcons: representation.icons,
          // Transitional scalar retained for other existing consumers until they
          // migrate to the complete icon array. It is the semantic/type icon when
          // a composed representation exists.
          __entryIcon: representation.icons.at(-1) ?? null,
          __entityIcon: referencedDefinition.icon.replace(/^bi-/, ''),
          __referenceUnavailable:
            uniqueThrough && uniqueThrough.objectKey === field.referenceBOKey
              ? Boolean(record[uniqueThrough.field])
              : typeof id === 'string' && linkedValues.has(id),
          __referenceUnavailableReason:
            uniqueThrough || (typeof id === 'string' && linkedValues.has(id))
              ? 'This entry is already assigned through a unique relationship.'
              : '',
        };
      });
  }

  return output;
}
