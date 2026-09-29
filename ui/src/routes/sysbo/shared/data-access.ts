import type { Request } from 'express';

import {
  evaluateExpression,
  resolveEntryRepresentation,
  type ManatOSContext,
  type SysBOFieldMetadata,
  type SysBOMetadata,
  type SysBOUIMetadata,
} from '@manatos/shared';

import { apiClient } from '../../../api/client.js';
import { apiSessionOptions } from '../../../auth/api-session.js';
import { getSysBODefinition } from '../../../sysbo/definitions.js';
import { apiPathFor } from '../../../sysbo/api-path.js';
import type { SysBODefinition } from '../../../sysbo/types.js';
import { entityContextName } from '../../../context/manatos-context.js';
import { createCalculatedRecordProjector } from '../../../runtime/projection/calculated-record-projector.js';
import { memoizeRequest } from '../../../runtime/request-memo.js';

export { apiPathFor } from '../../../sysbo/api-path.js';

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
  return memoizeRequest(
    req,
    `api:get:/api/v1/${apiPathFor(definition.key)}/$metadata`,
    async () => {
      const response = await apiClient.get<{ metadata: SysBOMetadata<Record<string, unknown>> }>(
        `/api/v1/${apiPathFor(definition.key)}/$metadata`,
        apiSessionOptions(req),
      );
      return response.data.metadata;
    },
  );
}

/** Load framework-neutral presentation metadata for one SysBO. */
export async function canonicalSysBOUIMetadata(
  req: Request,
  definition: SysBODefinition,
): Promise<SysBOUIMetadata> {
  return memoizeRequest(
    req,
    `api:get:/api/v1/${apiPathFor(definition.key)}/$metadata-ui`,
    async () => {
      const response = await apiClient.get<{ metadataUI: SysBOUIMetadata }>(
        `/api/v1/${apiPathFor(definition.key)}/$metadata-ui`,
        apiSessionOptions(req),
      );
      return response.data.metadataUI;
    },
  );
}

function apiErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const response = (error as { response?: unknown }).response;
  if (!response || typeof response !== 'object') return null;
  const status = (response as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

function apiErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function referenceCatalogueUnavailable(error: unknown): boolean {
  const status = apiErrorStatus(error);
  const code = apiErrorCode(error);
  return status === 403 || code === 'FORBIDDEN' || code === 'HTTP_403';
}

export interface ReferenceSelectorContext {
  referenceData: Record<string, Readonly<Record<string, unknown>>[]>;
  excludedCandidateIds: readonly string[];
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
  ctx?: ManatOSContext,
): Promise<ReferenceSelectorContext> {
  const excludedCandidateIds = candidates
    .filter((candidate) => candidate.__referenceUnavailable === true)
    .map((candidate) => candidate.id ?? candidate.value)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (!field.referenceBOKey) {
    return { referenceData: {}, excludedCandidateIds };
  }

  let targetDefinition: SysBODefinition;
  try {
    targetDefinition = getSysBODefinition(field.referenceBOKey);
  } catch {
    return { referenceData: {}, excludedCandidateIds };
  }

  /*
   * A selector renders the target entity's list projection. Only reference
   * fields that are actually visible in that projection need nested
   * catalogues. Loading every reference field on the target entity made one
   * source reference control fan out into unrelated pageSize=500 reads.
   */
  const targetUIMetadata =
    targetDefinition.boMetadata.exposure === 'internal'
      ? undefined
      : await canonicalSysBOUIMetadata(req, targetDefinition);
  const selectorFieldKeys = targetUIMetadata?.list.visibleFields ?? [
    targetDefinition.boMetadata.primaryField,
  ];

  return {
    referenceData: await references(req, targetDefinition, {
      ctx,
      fieldKeys: selectorFieldKeys,
    }),
    excludedCandidateIds,
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
  options: Readonly<{
    sourceRecordId?: string | null;
    sourceRecord?: Readonly<Record<string, unknown>> | null;
    ctx?: ManatOSContext | undefined;
    /** Optional effective-view field demand; omitted preserves all-reference behavior. */
    fieldKeys?: ReadonlySet<string> | readonly string[];
    /** Read-only presentation needs only persisted targets, not an editable candidate catalogue. */
    selectionOnly?: boolean;
    /** Persisted target ids required by collection/link rows for read-only presentation. */
    selectedIdsByField?: Readonly<Record<string, readonly string[]>>;
  }> = {},
): Promise<Record<string, Readonly<Record<string, unknown>>[]>> {
  const output: Record<string, Readonly<Record<string, unknown>>[]> = {};
  const requestedFieldKeys = options.fieldKeys ? new Set(options.fieldKeys) : null;

  await Promise.all(
    Object.values(definition.boMetadata.fieldDefinition).map(async (field) => {
      if (!field.referenceBOKey || (requestedFieldKeys && !requestedFieldKeys.has(field.key)))
        return;

      let apiPath: string;
      try {
        apiPath = apiPathFor(field.referenceBOKey);
      } catch {
        return;
      }

      const selectedId = options.sourceRecord?.[field.key];
      let response: { data: SysBOListData<unknown> };
      if (options.selectionOnly) {
        const selectedIds = [
          ...(typeof selectedId === 'string' && selectedId.length ? [selectedId] : []),
          ...(options.selectedIdsByField?.[field.key] ?? []),
        ].filter((id, index, values) => id.length > 0 && values.indexOf(id) === index);
        if (selectedIds.length === 0) {
          output[field.key] = [];
          return;
        }
        const selectedRecords = (
          await Promise.all(
            selectedIds.map(async (id) => {
              try {
                const selectedResponse = await memoizeRequest(
                  req,
                  `api:get:/api/v1/${apiPath}/${encodeURIComponent(id)}`,
                  () =>
                    apiClient.get<Record<string, unknown>>(
                      `/api/v1/${apiPath}/${encodeURIComponent(id)}`,
                      apiSessionOptions(req),
                    ),
                );
                return selectedResponse.data;
              } catch (error) {
                if (referenceCatalogueUnavailable(error)) return null;
                throw error;
              }
            }),
          )
        ).filter((record): record is Record<string, unknown> => record !== null);
        response = {
          data: {
            items: selectedRecords,
            paging: {
              total: selectedRecords.length,
              page: 1,
              pageSize: Math.max(selectedRecords.length, 1),
              totalPages: 1,
            },
          },
        };
      } else {
        try {
          response = await memoizeRequest(
            req,
            `api:get:/api/v1/${apiPath}?pageSize=500&sort=name`,
            () =>
              apiClient.get<SysBOListData<unknown>>(
                `/api/v1/${apiPath}?pageSize=500&sort=name`,
                apiSessionOptions(req),
              ),
          );
        } catch (error) {
          if (referenceCatalogueUnavailable(error)) {
            output[field.key] = [];
            return;
          }
          throw error;
        }
      }
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
      const selection = options.selectionOnly ? undefined : field.referenceSelection;
      const uniqueThrough = selection?.uniqueThrough;
      let linkedValues = new Set<string>();
      if (uniqueThrough) {
        try {
          const ownerPath = apiPathFor(uniqueThrough.objectKey);
          const ownerResponse = await memoizeRequest(
            req,
            `api:get:/api/v1/${ownerPath}?pageSize=500&sort=name`,
            () =>
              apiClient.get<SysBOListData<Record<string, unknown>>>(
                `/api/v1/${ownerPath}?pageSize=500&sort=name`,
                apiSessionOptions(req),
              ),
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
      const candidateAllowed = (candidate: Record<string, unknown>) => {
        if (selection?.filterExpression) {
          const matchesExpression = Boolean(
            evaluateExpression(selection.filterExpression, candidate, candidate, {
              source: 'reference-selection',
              sourcePath: `${definition.key}.${field.key}.referenceSelection`,
              purpose: 'filter reference candidates',
            }),
          );
          if (!matchesExpression) return false;
        }

        const traitFilter = selection?.filterEnumItemTrait;
        if (!traitFilter) return true;
        const targetField = referencedDefinition.boMetadata.fieldDefinition[traitFilter.field];
        const candidateValue = candidate[traitFilter.field];
        const enumItem = targetField?.enumItems?.find((item) => item.value === candidateValue);
        return enumItem?.[traitFilter.trait] === true;
      };

      const projectReference = (record: Record<string, unknown>) => {
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
          __entryIcons: representation.icons,
          __entryIcon: representation.icons.at(-1) ?? null,
          __entityIcon: referencedDefinition.icon.replace(/^bi-/, ''),
          __referenceUnavailable: Boolean(
            (selection?.excludeCurrent &&
              definition.key === field.referenceBOKey &&
              options.sourceRecordId &&
              String(id ?? '') === String(options.sourceRecordId)) ||
            (uniqueThrough && uniqueThrough.objectKey === field.referenceBOKey
              ? Boolean(record[uniqueThrough.field])
              : typeof id === 'string' && linkedValues.has(id)),
          ),
          __referenceUnavailableReason:
            selection?.excludeCurrent &&
            definition.key === field.referenceBOKey &&
            options.sourceRecordId &&
            String(id ?? '') === String(options.sourceRecordId)
              ? 'The current entry cannot reference itself.'
              : uniqueThrough || (typeof id === 'string' && linkedValues.has(id))
                ? 'This entry is already assigned through a unique relationship.'
                : '',
        };
      };

      const rawCandidates = response.data.items as Record<string, unknown>[];
      const allCandidates = options.ctx
        ? await Promise.all(
            rawCandidates.map(
              createCalculatedRecordProjector(referencedDefinition.boMetadata, options.ctx, {
                source: 'renderer',
                sourcePath: `ctx.entities.${entityContextName(referencedDefinition.key)}`,
                purpose: 'project calculated reference-selector candidate field',
              }),
            ),
          )
        : rawCandidates;
      const projected = allCandidates.filter(candidateAllowed).map(projectReference);

      /*
       * A persisted reference is presentation data as well as a future-selection
       * candidate. Always retain the record currently stored on the source entry,
       * even if today's candidate policy would filter it out. Page and hosted-popup
       * entries therefore resolve the same id to the same label/icon and policy
       * changes can never make an existing relationship render as `None`.
       */
      if (
        typeof selectedId === 'string' &&
        selectedId.length > 0 &&
        !projected.some((candidate) => String(candidate.value ?? '') === selectedId)
      ) {
        let persistedCandidate = allCandidates.find(
          (candidate) => String(candidate.id ?? '') === selectedId,
        );
        if (!persistedCandidate) {
          try {
            const persistedResponse = await apiClient.get<Record<string, unknown>>(
              `/api/v1/${apiPath}/${encodeURIComponent(selectedId)}`,
              apiSessionOptions(req),
            );
            persistedCandidate = options.ctx
              ? await createCalculatedRecordProjector(
                  referencedDefinition.boMetadata,
                  options.ctx,
                  {
                    source: 'renderer',
                    sourcePath: `ctx.entities.${entityContextName(referencedDefinition.key)}`,
                    purpose: 'project persisted reference-selector candidate field',
                  },
                )(persistedResponse.data)
              : persistedResponse.data;
          } catch {
            // Selection catalogues are advisory, but presentation of an unreadable
            // referenced record must not fabricate a label. Leave it unresolved.
          }
        }
        if (persistedCandidate) projected.push(projectReference(persistedCandidate));
      }

      output[field.key] = projected;
    }),
  );

  return output;
}
