import type { Request, Response } from 'express';

import {
  AppError,
  operationContext,
  resolveEntryRepresentation,
  resolveSysBOUIView,
  type ManatOSContext,
  type OperationNodeSnapshot,
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
  transactionId?: string,
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
      latest = (
        await apiClient.delete<Record<string, unknown>>(
          path,
          transactionOptions(req, transactionId),
        )
      ).data;
      continue;
    }
    if (change.contentType && change.dataBase64) {
      latest = (
        await apiClient.put<Record<string, unknown>>(
          path,
          { contentType: change.contentType, dataBase64: change.dataBase64 },
          transactionOptions(req, transactionId),
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
  transactionId?: string,
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
            transactionOptions(req, transactionId),
          )
        ).data;
      },
      `Saving ${field.label}`,
    );
  }
  return latest;
}

function hasPictureResourceChanges(req: Request, definition: SysBODefinition): boolean {
  return Object.values(definition.boMetadata.fieldDefinition).some((field) => {
    if (field.type !== 'picture' && field.type !== 'pictures') return false;
    const key =
      field.type === 'picture' ? `pictureChange.${field.key}` : `picturesChange.${field.key}`;
    return typeof req.body[key] === 'string' && Boolean(req.body[key]);
  });
}

function transactionOptions(req: Request, transactionId?: string) {
  return {
    ...apiSessionOptions(req),
    ...(transactionId ? { transactionId } : {}),
  };
}

interface RollbackFailure {
  description: string;
  message: string;
}

function appendRollbackDiagnostics(
  error: AppError,
  transactionId: string,
  failures: RollbackFailure[],
  rollbackRequestError?: unknown,
): void {
  if (!failures.length && !rollbackRequestError) return;

  const children: OperationNodeSnapshot[] = failures.map((failure, index) => ({
    id: `${transactionId}:rollback:${index}`,
    description: failure.description,
    userDescription: 'Rollback compensation failed',
    status: 'failed',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    comments: [],
    children: [],
    errorCode: 'TRANSACTION_ROLLBACK_FAILURE',
    errorMessage: failure.message,
  }));

  if (rollbackRequestError) {
    const rollbackError = rollbackRequestError instanceof AppError ? rollbackRequestError : null;
    children.push({
      id: `${transactionId}:rollback:request`,
      description: 'Rollback transaction request',
      userDescription: 'Rollback could not be completed',
      status: 'failed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      comments: [],
      children: rollbackError?.operationTrace ?? [],
      errorCode: rollbackError?.code ?? 'TRANSACTION_ROLLBACK_FAILURE',
      errorMessage: rollbackError?.message ?? String(rollbackRequestError),
    });
  }

  const now = new Date().toISOString();
  const rollbackNode: OperationNodeSnapshot = {
    id: `${transactionId}:rollback`,
    description: 'Rollback Entry Save transaction',
    userDescription: 'Rollback encountered problems; storage may require maintenance',
    status: 'failed',
    startedAt: now,
    completedAt: now,
    comments: [],
    children,
    errorCode: 'TRANSACTION_ROLLBACK_INCOMPLETE',
    errorMessage: 'One or more rollback operations failed.',
  };
  error.operationTrace = [...(error.operationTrace ?? []), rollbackNode];
}

async function finalizeEntryTransaction<T>(
  req: Request,
  transactionId: string,
  phase: 'commit' | 'rollback',
): Promise<T> {
  const path = `/api/v1/transactions/${encodeURIComponent(transactionId)}/$${phase}`;
  let firstError: unknown;
  try {
    return (await apiClient.post<T>(path, undefined, apiSessionOptions(req))).data;
  } catch (error) {
    firstError = error;
  }

  // Finalization is idempotent for a short terminal-retention window on the API.
  // Retry once so a lost response after a successful COMMIT/ROLLBACK does not
  // incorrectly turn a known terminal transaction into an ambiguous result.
  try {
    return (await apiClient.post<T>(path, undefined, apiSessionOptions(req))).data;
  } catch (retryError) {
    if (phase === 'commit') {
      const uncertain = new AppError(
        'TRANSACTION_COMMIT_UNCERTAIN',
        `Entry Save transaction '${transactionId}' commit could not be confirmed after retry.`,
        'The save reached its final commit stage, but the server could not confirm the result. Refresh before making further changes.',
        false,
        { cause: retryError ?? firstError },
      );
      const diagnosticError =
        retryError instanceof AppError
          ? retryError
          : firstError instanceof AppError
            ? firstError
            : null;
      if (diagnosticError?.operationTrace?.length) {
        uncertain.operationTrace = [...diagnosticError.operationTrace];
      }
      throw uncertain;
    }
    throw retryError;
  }
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
      const invocation = entryInvocation(req);
      const canonicalUIMetadata = await canonicalSysBOUIMetadata(req, definition);
      const uiMetadata = resolveSysBOUIView(canonicalUIMetadata, invocation.uiViewKey).metadata;
      const relatedChanges = metadataCollectionRelatedChanges(
        req.body as Record<string, unknown>,
        uiMetadata,
      );
      if (Object.keys(relatedChanges).length) payload.relatedChanges = relatedChanges;

      let transactionId: string | undefined;
      if (hasPictureResourceChanges(req, definition)) {
        const started = await apiClient.post<{ transactionId: string }>(
          '/api/v1/transactions',
          undefined,
          apiSessionOptions(req),
        );
        transactionId = started.data.transactionId;
      }

      let saved: { data: Record<string, unknown> };
      let pictureUpdatedRecord: Record<string, unknown> | null = null;
      let picturesUpdatedRecord: Record<string, unknown> | null = null;

      try {
        saved = id
          ? await apiClient.patch<Record<string, unknown>>(
              `/api/v1/${apiPath}/${id}`,
              payload,
              transactionOptions(req, transactionId),
            )
          : await apiClient.post<Record<string, unknown>>(
              `/api/v1/${apiPath}`,
              payload,
              transactionOptions(req, transactionId),
            );

        const savedIdForResources = String(saved.data.id ?? id);
        pictureUpdatedRecord = savedIdForResources
          ? await persistPictureChanges(req, definition, savedIdForResources, transactionId)
          : null;
        picturesUpdatedRecord = savedIdForResources
          ? await persistPicturesChanges(req, definition, savedIdForResources, transactionId)
          : null;
      } catch (error) {
        if (transactionId) {
          let rollbackFailures: RollbackFailure[] = [];
          let rollbackRequestError: unknown;
          try {
            const rolledBack = await finalizeEntryTransaction<{
              transactionId: string;
              rollbackFailures: RollbackFailure[];
            }>(req, transactionId, 'rollback');
            rollbackFailures = rolledBack.rollbackFailures ?? [];
          } catch (rollbackError) {
            rollbackRequestError = rollbackError;
          }
          const finalError =
            error instanceof AppError
              ? error
              : new AppError(
                  'UNEXPECTED_ERROR',
                  error instanceof Error ? error.message : String(error),
                  'The entry could not be saved.',
                  true,
                  { cause: error },
                );
          appendRollbackDiagnostics(
            finalError,
            transactionId,
            rollbackFailures,
            rollbackRequestError,
          );
          throw finalError;
        }
        throw error;
      }

      // COMMIT is deliberately outside the business-operation catch above.
      // If the commit response is lost after the API has already committed,
      // rolling back here would be wrong. finalizeEntryTransaction retries the
      // idempotent terminal operation once and otherwise reports uncertainty.
      if (transactionId) {
        await finalizeEntryTransaction<{
          transactionId: string;
          cleanupFailures: RollbackFailure[];
        }>(req, transactionId, 'commit');
      }

      const savedId = String(saved.data.id ?? id);
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
    const canonicalUIMetadata = await canonicalSysBOUIMetadata(req, definition);
    const uiMetadata = resolveSysBOUIView(canonicalUIMetadata, invocation.uiViewKey).metadata;
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
      _entryHost: invocation.host,
      _entryToken: invocation.token,
      _entryMode: 'edit',
      ...(invocation.uiViewKey ? { _entryUIView: invocation.uiViewKey } : {}),
      ...(invocation.density === 'compact' ? { _entryDensity: 'compact' } : {}),
      ...(invocation.recoverable === false ? { _entryRecoverable: '0' } : {}),
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
