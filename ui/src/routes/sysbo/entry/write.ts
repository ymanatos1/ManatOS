import type { Request, Response } from 'express';

import {
  AppError,
  operationContext,
  resolveEntryRepresentation,
  type ManatOSContext,
  type SysBOUIMetadata,
  type SysBOUser,
} from '@manatos/shared';

import { apiClient } from '../../../api/client.js';
import { apiSessionOptions } from '../../../auth/api-session.js';
import { entityContextName } from '../../../context/manatos-context.js';
import { createCalculatedRecordProjector } from '../../../runtime/projection/calculated-record-projector.js';

import type { SysBODefinition } from '../../../sysbo/types.js';
import { apiPathFor, canonicalSysBOUIMetadata } from '../shared/data-access.js';
import { collectionEditorDescriptors } from '../related/collection-editor-metadata.js';
import { entryInvocation } from './invocation.js';
import { formPayload } from './form-payload.js';
import { refreshExternalProviderRuntime } from './external-provider-write.js';

function metadataCollectionRelatedChanges(
  body: Record<string, unknown>,
  uiMetadata: SysBOUIMetadata,
): Record<string, { current: unknown[] }> {
  const relatedChanges: Record<string, { current: unknown[] }> = {};

  for (const descriptor of collectionEditorDescriptors(uiMetadata)) {
    const raw = body[`relatedChanges.${descriptor.sourceKey}`];
    if (typeof raw !== 'string' || !raw) continue;

    let current: unknown[];
    try {
      const parsed = JSON.parse(raw) as { current?: unknown[] };
      current = Array.isArray(parsed.current) ? parsed.current : [];
    } catch {
      throw new AppError(
        'VALIDATION_ERROR',
        `Invalid collection-editor payload for ${descriptor.sourceKey}.`,
        `${descriptor.label} could not be saved.`,
        false,
      );
    }

    relatedChanges[descriptor.sourceKey] = {
      current: descriptor.itemFieldKeys.length
        ? current.map((item) => {
            const record =
              item && typeof item === 'object' && !Array.isArray(item)
                ? (item as Record<string, unknown>)
                : {};
            return Object.fromEntries(
              descriptor.itemFieldKeys.map((fieldKey) => [
                fieldKey,
                String(record[fieldKey] ?? ''),
              ]),
            );
          })
        : current.map(String),
    };
  }

  return relatedChanges;
}

async function persistPictureChanges(
  req: Request,
  definition: SysBODefinition,
  savedId: string,
): Promise<Record<string, unknown> | null> {
  let latest: Record<string, unknown> | null = null;
  for (const field of Object.values(definition.boMetadata.fieldDefinition)) {
    if (field.type !== 'picture') continue;
    const raw = req.body[`pictureChange.${field.key}`];
    if (typeof raw !== 'string' || !raw) continue;
    let change: { clear?: boolean; contentType?: string; dataBase64?: string };
    try {
      change = JSON.parse(raw);
    } catch {
      throw new AppError(
        'VALIDATION_ERROR',
        `Invalid picture change payload for ${field.key}.`,
        `${field.label} could not be processed.`,
        false,
      );
    }
    const path = `/api/v1/${apiPathFor(definition.key)}/${encodeURIComponent(savedId)}/$picture/${encodeURIComponent(field.key)}`;
    if (change.clear) {
      latest = (await apiClient.delete<Record<string, unknown>>(path, apiSessionOptions(req))).data;
      continue;
    }
    if (change.contentType && change.dataBase64) {
      latest = (
        await apiClient.put<Record<string, unknown>>(
          path,
          { contentType: change.contentType, dataBase64: change.dataBase64 },
          apiSessionOptions(req),
        )
      ).data;
    }
  }
  return latest;
}

async function persistPicturesChanges(
  req: Request,
  definition: SysBODefinition,
  savedId: string,
): Promise<Record<string, unknown> | null> {
  let latest: Record<string, unknown> | null = null;
  for (const field of Object.values(definition.boMetadata.fieldDefinition)) {
    if (field.type !== 'pictures') continue;
    const raw = req.body[`picturesChange.${field.key}`];
    if (typeof raw !== 'string' || !raw) continue;

    let change: {
      changed?: boolean;
      pictures?: Array<{
        id?: string;
        contentType?: string;
        dataBase64?: string;
      }>;
    };
    try {
      change = JSON.parse(raw);
    } catch {
      throw new AppError(
        'VALIDATION_ERROR',
        `Invalid pictures replacement payload for ${field.key}.`,
        `${field.label} could not be processed.`,
        false,
      );
    }

    if (change.changed !== true) continue;
    const pictures = Array.isArray(change.pictures) ? change.pictures : [];
    latest = await operationContext.run(
      `Replace ${field.label} pictures`,
      async (scope) => {
        scope.addContext({ field: field.key, pictureCount: pictures.length });
        return (
          await apiClient.put<Record<string, unknown>>(
            `/api/v1/${apiPathFor(definition.key)}/${encodeURIComponent(savedId)}/$pictures/${encodeURIComponent(field.key)}`,
            { changed: true, pictures },
            apiSessionOptions(req),
          )
        ).data;
      },
      `Saving ${field.label}`,
    );
  }
  return latest;
}

export async function persistMetadataDrivenEntry(
  req: Request,
  definition: SysBODefinition,
  id: string,
): Promise<{ savedId: string; savedRecord: Record<string, unknown> }> {
  const apiPath = apiPathFor(definition.key);

  return operationContext.runRoot(
    `${id ? 'Update' : 'Create'} ${definition.boMetadata.label}`,
    async (scope) => {
      scope.addContext({ id, name: req.body.name });

      const payload = formPayload(req.body, definition);
      const uiMetadata = await canonicalSysBOUIMetadata(req, definition);
      const relatedChanges = metadataCollectionRelatedChanges(
        req.body as Record<string, unknown>,
        uiMetadata,
      );
      if (Object.keys(relatedChanges).length) payload.relatedChanges = relatedChanges;

      const saved = id
        ? await apiClient.patch<Record<string, unknown>>(
            `/api/v1/${apiPath}/${id}`,
            payload,
            apiSessionOptions(req),
          )
        : await apiClient.post<Record<string, unknown>>(
            `/api/v1/${apiPath}`,
            payload,
            apiSessionOptions(req),
          );

      const savedId = String(saved.data.id ?? id);
      const pictureUpdatedRecord = savedId
        ? await persistPictureChanges(req, definition, savedId)
        : null;
      const picturesUpdatedRecord = savedId
        ? await persistPicturesChanges(req, definition, savedId)
        : null;
      if (definition.key === 'sys-ext-auth-providers') await refreshExternalProviderRuntime();

      const savedRecord = picturesUpdatedRecord ?? pictureUpdatedRecord ?? saved.data;
      if (definition.key === 'sys-users' && savedId && req.session.userId === savedId) {
        req.session.currentUserSnapshot = savedRecord as unknown as SysBOUser;
      }

      return { savedId, savedRecord };
    },
    `Saving ${definition.boMetadata.label}`,
  );
}

async function projectSavedRecordForCtx(
  res: Response,
  definition: SysBODefinition,
  record: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const ctx = res.locals.ctx as ManatOSContext;
  return createCalculatedRecordProjector(definition.boMetadata, ctx, {
    source: 'renderer',
    sourcePath: `ctx.entities.${entityContextName(definition.key)}`,
    purpose: 'project calculated fields on saved record before UI publication',
  })(record);
}

export async function completeMetadataDrivenSave(
  req: Request,
  res: Response,
  definition: SysBODefinition,
  savedId?: string,
  savedRecord?: Record<string, unknown>,
): Promise<void> {
  const saveMode = req.body._saveMode === 'close' ? 'close' : 'stay';
  const browserSave = req.get('X-Requested-With') === 'ManatOS-InPlace-Save';
  const listUrl = `/bo/${definition.key}`;
  const entryUrl = savedId ? `${listUrl}/${encodeURIComponent(savedId)}` : listUrl;
  const invocation = entryInvocation(req);

  if (invocation.popup && invocation.token && savedId && !browserSave) {
    const rawRecord =
      savedRecord ??
      (
        await apiClient.get<Record<string, unknown>>(
          `/api/v1/${apiPathFor(definition.key)}/${encodeURIComponent(savedId)}`,
          apiSessionOptions(req),
        )
      ).data;
    const record = await projectSavedRecordForCtx(res, definition, rawRecord);
    const uiMetadata = await canonicalSysBOUIMetadata(req, definition);
    const representation = resolveEntryRepresentation(definition.boMetadata, uiMetadata, record, {
      entityIcon: definition.icon,
    });
    const close = saveMode === 'close';
    const payload = JSON.stringify({
      type: 'manatos:entry-popup-saved',
      token: invocation.token,
      entityKey: definition.key,
      id: savedId,
      record,
      representation,
      close,
    }).replaceAll('<', '\\u003c');
    const continueUrl = `${entryUrl}?${new URLSearchParams({
      _entryPopup: '1',
      _entryPopupToken: invocation.token,
      _entryMode: 'edit',
      _entryDefaults: JSON.stringify(invocation.defaults),
      _entryOverrides: JSON.stringify(invocation.uiOverrides),
    }).toString()}`;
    const continuation = close
      ? ''
      : `window.location.replace(${JSON.stringify(continueUrl).replaceAll('<', '\\u003c')});`;
    res
      .type('html')
      .send(
        `<!doctype html><html><body><script>parent.postMessage(${payload}, window.location.origin);${continuation}</script></body></html>`,
      );
    return;
  }

  if (!browserSave || !savedId) {
    res.redirect(saveMode === 'close' ? listUrl : entryUrl);
    return;
  }

  const apiPath = apiPathFor(definition.key);
  const rawRecord =
    savedRecord ??
    (
      await apiClient.get<Record<string, unknown>>(
        `/api/v1/${apiPath}/${encodeURIComponent(savedId)}`,
        apiSessionOptions(req),
      )
    ).data;
  const record = await projectSavedRecordForCtx(res, definition, rawRecord);

  res.set('Cache-Control', 'no-store');
  res.json({
    success: true,
    data: {
      id: savedId,
      record,
      entryUrl,
      listUrl,
      close: saveMode === 'close',
      created: !String(req.body.id ?? ''),
    },
  });
}

export function failedSaveItemOverride(
  req: Request,
  definition: SysBODefinition,
  id: string,
): Record<string, unknown> {
  return {
    ...Object.fromEntries(
      Object.keys(definition.boMetadata.fieldDefinition)
        .filter((fieldKey) => Object.prototype.hasOwnProperty.call(req.body, fieldKey))
        .map((fieldKey) => [fieldKey, req.body[fieldKey]]),
    ),
    ...(id ? { id } : {}),
  };
}

export async function deleteMetadataDrivenEntry(
  req: Request,
  definition: SysBODefinition,
  id: string,
): Promise<void> {
  await operationContext.runRoot(`Delete ${definition.boMetadata.label}`, async () => {
    await apiClient.delete(`/api/v1/${apiPathFor(definition.key)}/${id}`, apiSessionOptions(req));
    if (definition.key === 'sys-ext-auth-providers') await refreshExternalProviderRuntime();
  });
}
