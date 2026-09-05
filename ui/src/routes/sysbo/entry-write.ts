import type { Request, Response } from 'express';

import { AppError, operationContext, type SysBOUser } from '@manatos/shared';

import { apiClient } from '../../api/client.js';
import { apiSessionOptions } from '../../auth/api-session.js';

import type { SysBODefinition } from '../../sysbo/types.js';
import { apiPathFor } from './data-access.js';
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

  if (!inPlaceSave || !savedId) {
    res.redirect(saveMode === 'close' ? listUrl : entryUrl);
    return;
  }

  const apiPath = apiPathFor(definition.key);
  const record =
    savedRecord ??
    (
      await apiClient.get<Record<string, unknown>>(
        `/api/v1/${apiPath}/${encodeURIComponent(savedId)}`,
        apiSessionOptions(req),
      )
    ).data;

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
