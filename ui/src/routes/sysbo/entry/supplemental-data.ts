import type { Request } from 'express';

import {
  resolveEntryRepresentation,
  type ManatOSContext,
  type SysBOUIMetadata,
  type SysBOUser,
} from '@manatos/shared';

import { apiClient } from '../../../api/client.js';
import type { ExternalAuthProviderDefinition } from '../../../auth/providers/types.js';
import { apiSessionOptions } from '../../../auth/api-session.js';
import { externalIdentitiesForUser } from '../../../auth/user-authentication.js';
import { getSysBODefinition } from '../../../sysbo/definitions.js';
import type { SysBODefinition } from '../../../sysbo/types.js';
import {
  apiPathFor,
  references,
  selectorContextForReferenceField,
  type SysBOListData,
} from '../shared/data-access.js';
import { loadRelatedCollections } from '../related/collections.js';
import {
  resolveUIEntityPermissions,
  type UIEntityPermissions,
} from '../../../sysbo/permissions.js';
import { createCalculatedRecordProjector } from '../../../runtime/projection/calculated-record-projector.js';
import { entityContextName } from '../../../context/manatos-context.js';

/**
 * Build supplemental data required by the canonical metadata-driven SysBO
 * record page. This keeps page-data composition out of route orchestration.
 */
export async function editPageSupplementalData(
  req: Request,
  definition: SysBODefinition,
  currentUser: SysBOUser | null,
  item: Record<string, unknown>,
  isNew: boolean,
  effectiveUIMetadata?: SysBOUIMetadata,
  permissions?: UIEntityPermissions,
  ctx?: ManatOSContext,
) {
  const itemId = typeof item.id === 'string' ? item.id : '';

  const authenticationIdentities =
    definition.key === 'sys-users' && !isNew && itemId
      ? await externalIdentitiesForUser(itemId)
      : [];

  const { collectionResourceData } = await loadRelatedCollections(
    req,
    item,
    isNew,
    effectiveUIMetadata,
    { externalIdentities: authenticationIdentities },
    ctx,
  );

  const deleteImpact =
    !isNew && itemId && permissions?.delete
      ? (
          await apiClient.get<{
            targetObjectKey: string;
            targetId: string;
            canExecute: boolean;
            requiresConfirmation: boolean;
            impacts: Array<{
              objectKey: string;
              objectName: string;
              relationship: string;
              count: number;
              action: 'restrict' | 'cascade' | 'set-null' | 'unlink' | 'retain';
              confirmation: 'silent' | 'confirm' | 'inherit';
            }>;
          }>(
            `/api/v1/${apiPathFor(definition.key)}/${encodeURIComponent(itemId)}/$delete-impact`,
            apiSessionOptions(req),
          )
        ).data
      : null;

  let externalAuthProviderDefinitions =
    definition.key === 'sys-ext-auth-providers'
      ? (
          await apiClient.get<{ providers: ExternalAuthProviderDefinition[] }>(
            '/api/v1/SysExtAuthProviders/definitions',
            apiSessionOptions(req),
          )
        ).data.providers
      : [];
  let suggestedProvider = '';
  if (definition.key === 'sys-ext-auth-providers' && isNew) {
    const configured = (
      await apiClient.get<SysBOListData<Record<string, unknown>>>(
        '/api/v1/SysExtAuthProviders?page=1&pageSize=100',
        apiSessionOptions(req),
      )
    ).data.items;
    const configuredKeys = new Set(
      configured.map((entry) => String(entry.provider ?? '').toLowerCase()),
    );
    externalAuthProviderDefinitions = externalAuthProviderDefinitions.filter(
      (entry) => !configuredKeys.has(entry.provider),
    );
    suggestedProvider = externalAuthProviderDefinitions[0]?.provider ?? '';
  }

  const primaryField = definition.boMetadata.fieldDefinition[definition.boMetadata.primaryField];
  const rawPrimaryValue = item[definition.boMetadata.primaryField];
  const primaryPresentationItem = [
    ...(primaryField?.optionItems || []),
    ...(primaryField?.enumItems || []),
  ].find((candidate) => candidate?.value === rawPrimaryValue);

  const pageReferenceData = await references(req, definition, {
    sourceRecordId: itemId,
    sourceRecord: item,
    ctx,
  });

  /*
   * Each reference field receives one canonical selector context derived from
   * the target entity itself. This avoids a second, caller-specific reference
   * presenter in the popup path: Parent/Root Principal, User, Application, etc.
   * all resolve through the same entity-aware metadata pipeline as normal lists.
   */
  const referenceSelectorContexts = Object.fromEntries(
    await Promise.all(
      Object.values(definition.boMetadata.fieldDefinition)
        .filter((field) => field.type === 'reference' && field.referenceBOKey)
        .map(async (field) => [
          field.key,
          await selectorContextForReferenceField(
            req,
            field,
            pageReferenceData[field.key] || [],
            ctx,
          ),
        ]),
    ),
  );

  /*
   * Authorization remains owned by the canonical capability service. Reference
   * components receive only projected target-entity capability facts; they do
   * not calculate roles/policy or make authorization decisions themselves.
   */
  const referenceTargetKeys = [
    ...new Set(
      Object.values(definition.boMetadata.fieldDefinition)
        .map((field) => field.referenceBOKey)
        .filter((key): key is string => Boolean(key)),
    ),
  ];
  const relatedEntityPermissions = Object.fromEntries(
    await Promise.all(
      referenceTargetKeys.map(async (targetKey) => {
        const targetDefinition = getSysBODefinition(targetKey);
        return [targetKey, await resolveUIEntityPermissions(req, targetDefinition)] as const;
      }),
    ),
  );

  if (definition.key === 'sys-principals' && itemId) {
    const linkedUser = (pageReferenceData.userId || []).find(
      (candidate) => String(candidate.principalId ?? '') === itemId,
    );
    item.userId = linkedUser?.id ?? null;
  }
  /*
   * A create surface is intentionally incomplete until browser-owned defaults
   * have been applied. Do not evaluate entry representation formulas against
   * that partial server record: required dependencies may not exist yet.
   * Existing entries remain fully representation-driven.
   */
  const representationRecord =
    !isNew && ctx
      ? await createCalculatedRecordProjector(definition.boMetadata, ctx, {
          source: 'renderer',
          sourcePath: `ctx.entities.${entityContextName(definition.key)}`,
          purpose: 'project calculated entry record before representation',
        })(item)
      : item;
  const entryRepresentation = isNew
    ? null
    : resolveEntryRepresentation(definition.boMetadata, effectiveUIMetadata, representationRecord, {
        entityIcon: definition.icon,
        referenceData: pageReferenceData,
      });
  const displayValue =
    entryRepresentation?.name ||
    String(primaryPresentationItem?.label ?? rawPrimaryValue ?? definition.boMetadata.label);

  if (definition.key === 'sys-ext-auth-providers') {
    pageReferenceData.provider = externalAuthProviderDefinitions.map((providerDefinition) => ({
      value: providerDefinition.provider,
      label: providerDefinition.label,
      icon: providerDefinition.icon.replace(/^bi-/, ''),
      callbackPath: providerDefinition.callbackPath,
      tenant: providerDefinition.tenant ?? null,
    }));
  }

  return {
    authenticationIdentities,
    collectionResourceData,
    referenceData: pageReferenceData,
    referenceSelectorContexts,
    relatedEntityPermissions,
    primaryDisplayValue: displayValue,
    deletePresentation: { displayValue, entityLabel: definition.boMetadata.label },
    deleteImpact,
    ...(definition.key === 'sys-ext-auth-providers'
      ? {
          externalAuthProviderDefinitions,
          suggestedProvider,
          credentialTest: credentialTestForPage(req, item, isNew),
        }
      : {}),
  };
}

/** Present a completed provider credential test through the standard page message contract. */
export function credentialTestResultPresentation(req: Request) {
  const result = String(req.query.credentialsTest ?? '');
  if (result === 'verified') {
    const storedPairVerified =
      req.session.pendingExtAuthCredentialTest?.usesStoredCredentials === true;
    return {
      informationTitle: 'Credentials verified',
      informationMessage: storedPairVerified
        ? 'The provider accepted the stored Client ID and Client secret. The saved credential pair is now verified.'
        : 'The provider accepted the Client ID and Client secret. The verified credential pair is ready to save.',
    };
  }
  if (result === 'failed') {
    return {
      warningTitle: 'Credential verification failed',
      warningMessage:
        req.session.pendingExtAuthCredentialTest?.errorMessage ??
        'The provider rejected the proposed credentials. Review the values on the Secrets tab and test them again.',
    };
  }
  return {};
}

/** Return short-lived provider credential-test state for the current metadata page. */
function credentialTestForPage(req: Request, item: Record<string, unknown>, isNew: boolean) {
  const pending = req.session.pendingExtAuthCredentialTest;
  if (!pending) return null;

  const itemId = typeof item.id === 'string' ? item.id : '';
  if ((pending.recordId ?? '') !== (isNew ? '' : itemId)) return null;

  return {
    provider: pending.provider,
    enabled: pending.enabled,
    clientId: pending.clientId,
    status: pending.status,
    verifiedAt: pending.verifiedAt,
    errorMessage: pending.errorMessage,
    hasPendingSecret: Boolean(pending.clientSecret),
  };
}
