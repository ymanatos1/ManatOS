import type { Request, Response } from 'express';

import createError from 'http-errors';

import {
  AppError,
  type SysBOUser,
} from '@manatos/shared';

import { apiClient } from '../../api/client.js';
import { apiSessionOptions } from '../../auth/api-session.js';
import { renderPage } from '../../presentation/render-page.js';
import { metadataComponentPartialFor } from '../../presentation/metadata-component-registry.js';
import { applySysBOEntryContext } from './context.js';
import {
  apiPathFor,
  canonicalSysBOMetadata,
  canonicalSysBOUIMetadata,
} from './data-access.js';
import { parentListContextForEntry } from './parent-list.js';
import type { UIEntityPermissions } from '../../sysbo/permissions.js';
import { compiledEntryRepresentationRuntime } from './entry-representation-runtime.js';
import {
  editPageSupplementalData,
  credentialTestResultPresentation,
} from './entry-supplemental-data.js';

import type { SysBODefinition } from '../../sysbo/types.js';

/**
 * Render one canonical metadata-driven SysBO record page.
 *
 * Route handlers decide which record is being opened and whether access is
 * allowed. This module owns record-page composition: canonical metadata,
 * authoritative record loading, supplemental/reference data, parent-list CTX,
 * entry CTX construction and the final metadata-driven page render.
 */
export async function renderMetadataDrivenRecord(
  req: Request,
  res: Response,
  definition: SysBODefinition,
  permissions: UIEntityPermissions,
  record: {
    isNew: boolean;
    recordId?: string;
    itemOverride?: Record<string, unknown>;
    applicationError?: AppError;
    parentOwnerContext?: Readonly<Record<string, unknown>>;
  },
): Promise<void> {
  const currentUser = res.locals.currentUser as SysBOUser | null;
  // Route orchestration already resolved the authoritative API capability
  // snapshot for this exact collection/record scope. Do not recalculate policy
  // inside the renderer or issue a second capability request.
  const effectivePermissions = permissions;
  const recordMode = record.isNew ? 'create' : effectivePermissions.update ? 'edit' : 'view';
  const [metadata, metadataUI] = await Promise.all([
    canonicalSysBOMetadata(req, definition),
    canonicalSysBOUIMetadata(req, definition),
  ]);
  const modeLabel = recordMode === 'create' ? 'Add' : recordMode === 'edit' ? 'Edit' : 'View';
  const primaryField = metadata.fieldDefinition[metadata.primaryField];

  if (!primaryField) {
    throw createError(500, `Primary field '${metadata.primaryField}' is missing from ${metadata.key} metadata.`);
  }

  const item = record.itemOverride ?? (record.recordId
    ? (
        await apiClient.get<Record<string, unknown>>(
          `/api/v1/${apiPathFor(definition.key)}/${record.recordId}`,
          apiSessionOptions(req),
        )
      ).data
    : {});

  const ownerDraft = Boolean(record.parentOwnerContext) && String(record.recordId ?? '').startsWith('draft:');
  const supplemental = await editPageSupplementalData(
    req,
    definition,
    currentUser,
    item,
    record.isNew || ownerDraft,
    metadataUI,
    effectivePermissions,
  );
  const parentListContext = await parentListContextForEntry(
    req,
    definition,
    metadata,
    metadataUI,
    effectivePermissions,
  );

  applySysBOEntryContext(
    res,
    definition,
    recordMode,
    record.isNew ? null : item,
    {
      recordId: record.recordId ?? null,
      formValues: item,
      metadata,
      // applySysBOEntryContext expects the effective UI contract under the
      // uiMetadata key. Passing `metadataUI` as a shorthand property silently
      // left that parameter undefined, so the CTX entity registry missed the
      // effective UI metadata even though the renderer itself received it. The
      // compiled browser AST for
      // reactive field rules (for example Parent principal editability) was absent.
      uiMetadata: metadataUI,
      permissions: effectivePermissions,
      referenceData: supplemental.referenceData,
      editingCollections: supplemental.relatedEditingData,
      ...supplemental.relatedData,
      activeTab: typeof req.query.tab === 'string' ? req.query.tab : null,
      parentListContext,
      ...(record.parentOwnerContext ? { parentOwnerContext: record.parentOwnerContext } : {}),
    },
  );

  const primaryDisplayValue = !record.isNew && supplemental.primaryDisplayValue && supplemental.primaryDisplayValue !== 'entry'
    ? ` - ${supplemental.primaryDisplayValue}`
    : '';

  await renderPage(res, 'pages/sysbo/entry', {
    title: `${modeLabel} ${metadata.name}${primaryDisplayValue}`,
    titleIcon: definition.icon,
    definition,
    metadata,
    metadataUI,
    primaryField,
    permissions: effectivePermissions,
    recordMode,
    recordId: record.recordId ?? null,
    item,
    ...supplemental,
    ...credentialTestResultPresentation(req),
    ...(record.applicationError ? { applicationError: record.applicationError } : {}),
    metadataComponentPartialFor,
    ownerEditing: Boolean(record.parentOwnerContext),
    ownerContext: record.parentOwnerContext ?? null,
    entryRepresentationRuntime: compiledEntryRepresentationRuntime(metadata, metadataUI, supplemental.referenceData),
  });
}
