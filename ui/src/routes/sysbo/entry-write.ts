import type { Request, Response } from 'express';

import {
  AppError,
  operationContext,
  resolveEntryRepresentation,
  type ManatOSContext,
  type SysBOUser,
} from '@manatos/shared';

import { apiClient } from '../../api/client.js';
import { apiSessionOptions } from '../../auth/api-session.js';
import { entityContextName } from '../../context/manatos-context.js';
import { createCalculatedRecordProjector } from '../../runtime/projection/calculated-record-projector.js';

import type { SysBODefinition } from '../../sysbo/types.js';
import { apiPathFor, canonicalSysBOUIMetadata } from './data-access.js';
import { entryInvocation } from './entry-invocation.js';
import { formPayload } from './form-payload.js';
import { refreshExternalProviderRuntime } from './external-provider-write.js';

function principalRelatedChanges(
  body: Record<string, unknown>,
): Record<string, { current: unknown[] }> {
  const relatedChanges: Record<string, { current: unknown[] }> = {};

  const parse = (
    key: string,
    developerMessage: string,
    invalidMessage: string,
  ): unknown[] | null => {
    const raw = body[`relatedChanges.${key}`];
    if (typeof raw !== 'string' || !raw) return null;
    try {
      const parsed = JSON.parse(raw) as { current?: unknown[] };
      return Array.isArray(parsed.current) ? parsed.current : [];
    } catch {
      throw new AppError('VALIDATION_ERROR', developerMessage, invalidMessage, false);
    }
  };

  const emails = parse(
    'emailAddresses',
    'Invalid email-address collection payload.',
    'The Contact email-address list could not be saved.',
  );
  if (emails) relatedChanges.emailAddresses = { current: emails.map(String) };

  const telephones = parse(
    'telephoneNumbers',
    'Invalid telephone-number collection payload.',
    'The Contact telephone-number list could not be saved.',
  );
  if (telephones) {
    relatedChanges.telephoneNumbers = {
      current: telephones.map((item) => {
        const record =
          item && typeof item === 'object' && !Array.isArray(item)
            ? (item as Record<string, unknown>)
            : {};
        return {
          countryCode: String(record.countryCode ?? ''),
          number: String(record.number ?? ''),
        };
      }),
    };
  }

  const addresses = parse(
    'addresses',
    'Invalid address collection payload.',
    'The Contact address list could not be saved.',
  );
  if (addresses) {
    relatedChanges.addresses = {
      current: addresses.map((item) => {
        const record =
          item && typeof item === 'object' && !Array.isArray(item)
            ? (item as Record<string, unknown>)
            : {};
        return {
          recipientOrAttention: String(record.recipientOrAttention ?? ''),
          organization: String(record.organization ?? ''),
          addressLine1: String(record.addressLine1 ?? ''),
          addressLine2: String(record.addressLine2 ?? ''),
          addressLine3: String(record.addressLine3 ?? ''),
          poBox: String(record.poBox ?? ''),
          postalCode: String(record.postalCode ?? ''),
          city: String(record.city ?? ''),
          stateOrProvince: String(record.stateOrProvince ?? ''),
          country: String(record.country ?? ''),
        };
      }),
    };
  }

  return relatedChanges;
}

export async function persistMetadataDrivenEntry(
  req: Request,
  definition: SysBODefinition,
  id: string,
): Promise<{ savedId: string; savedRecord: Record<string, unknown> }> {
  const apiPath = apiPathFor(definition.key);

  return operationContext.runRoot(
    `${id ? 'Update' : 'Create'} ${definition.boMetadata.name}`,
    async (scope) => {
      scope.addContext({ id, name: req.body.name });

      const payload = formPayload(req.body, definition);
      if (definition.key === 'sys-principals') {
        const relatedChanges = principalRelatedChanges(req.body as Record<string, unknown>);
        if (Object.keys(relatedChanges).length) payload.relatedChanges = relatedChanges;
      }

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
      if (definition.key === 'sys-ext-auth-providers') await refreshExternalProviderRuntime();

      if (definition.key === 'sys-users' && savedId && req.session.userId === savedId) {
        req.session.currentUserSnapshot = saved.data as unknown as SysBOUser;
      }

      return { savedId, savedRecord: saved.data };
    },
    `Saving ${definition.boMetadata.name}`,
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
  const inPlaceSave = saveMode === 'stay' && req.get('X-Requested-With') === 'ManatOS-InPlace-Save';
  const listUrl = `/bo/${definition.key}`;
  const entryUrl = savedId ? `${listUrl}/${encodeURIComponent(savedId)}` : listUrl;
  const invocation = entryInvocation(req);

  if (invocation.popup && invocation.token && savedId && !inPlaceSave) {
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

  if (!inPlaceSave || !savedId) {
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
  res.json({ success: true, data: { id: savedId, record, entryUrl } });
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
  await operationContext.runRoot(`Delete ${definition.boMetadata.name}`, async () => {
    await apiClient.delete(`/api/v1/${apiPathFor(definition.key)}/${id}`, apiSessionOptions(req));
    if (definition.key === 'sys-ext-auth-providers') await refreshExternalProviderRuntime();
  });
}
