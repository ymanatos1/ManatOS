import { randomUUID } from 'node:crypto';

import type { Request } from 'express';

import { AppError, type ExternalProviderKey } from '@manatos/shared';

import { apiClient } from '../../api/client.js';
import { apiSessionOptions } from '../../auth/api-session.js';
import { refreshExternalProviderRegistry } from '../../auth/providers/runtime-registry.js';
import type { ExternalAuthProviderDefinition } from '../../auth/providers/types.js';
import { configurePassport } from '../../auth/passport.js';

import type { SysBODefinition } from '../../sysbo/types.js';
import { apiPathFor } from './data-access.js';

export interface CredentialTestStartResult {
  success: true;
  testId: string;
  redirectUrl: string;
  statusUrl: string;
  cancelUrl: string;
}

export interface CredentialTestStatusResult {
  success: true;
  testId: string;
  provider: string;
  status: 'pending' | 'verified' | 'failed';
  message: string;
  verifiedAt?: string;
  verificationProofId?: string;
}

/** Capture one proposed provider credential pair in the server-side session. */
export async function startExternalProviderCredentialTest(
  req: Request,
): Promise<CredentialTestStartResult> {
  const provider = String(req.body.provider ?? '')
    .trim()
    .toLowerCase() as ExternalProviderKey;
  let clientId = String(req.body.clientId ?? '').trim();
  let clientSecret = String(req.body.clientSecret ?? '').trim();
  const recordId = String(req.body.id ?? '').trim();
  const useStoredCredentials = req.body.useStoredCredentials === 'true';

  if (useStoredCredentials && recordId) {
    const stored = await apiClient.get<{ clientId: string; clientSecret: string }>(
      `/api/v1/internal/external-auth-providers/${encodeURIComponent(recordId)}/credentials-for-test`,
      { ...apiSessionOptions(req), internal: true },
    );
    clientId = String(stored.data.clientId ?? '').trim();
    clientSecret = String(stored.data.clientSecret ?? '');
  }

  if (!clientId || !clientSecret) {
    throw new AppError(
      'VALIDATION_ERROR',
      useStoredCredentials
        ? 'No complete stored credential pair is available to verify.'
        : 'Enter both Client ID and Client secret before testing.',
      useStoredCredentials
        ? 'No complete stored credential pair is available to verify.'
        : 'Enter both Client ID and Client secret before testing.',
      false,
    );
  }

  const definitions = (
    await apiClient.get<{ providers: ExternalAuthProviderDefinition[] }>(
      '/api/v1/SysExtAuthProviders/definitions',
      apiSessionOptions(req),
    )
  ).data.providers;
  const providerDefinition = definitions.find((item) => item.provider === provider);
  if (!providerDefinition) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Unsupported external authentication provider.',
      'Choose a supported provider.',
    );
  }

  const pendingCredentialTest: NonNullable<typeof req.session.pendingExtAuthCredentialTest> = {
    testId: randomUUID(),
    ...(recordId ? { recordId } : {}),
    provider,
    enabled: req.body.enabled === 'on' || req.body.enabled === 'true' || req.body.enabled === true,
    clientId,
    clientSecret,
    scope: providerDefinition.scope,
    callbackPath: providerDefinition.callbackPath,
    ...(providerDefinition.tenant ? { tenant: providerDefinition.tenant } : {}),
    returnPath: recordId
      ? `/bo/sys-ext-auth-providers/${encodeURIComponent(recordId)}`
      : '/bo/sys-ext-auth-providers/new',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  req.session.pendingExtAuthCredentialTest = pendingCredentialTest;

  return {
    success: true,
    testId: pendingCredentialTest.testId,
    redirectUrl: `/auth/${provider}/test-credentials`,
    statusUrl: `/bo/sys-ext-auth-providers/test-credentials/status?testId=${encodeURIComponent(pendingCredentialTest.testId)}`,
    cancelUrl: '/bo/sys-ext-auth-providers/test-credentials/cancel',
  };
}

export function externalProviderCredentialTestStatus(
  req: Request,
): CredentialTestStatusResult | null {
  const requestedTestId = String(req.query.testId ?? '');
  const pending = req.session.pendingExtAuthCredentialTest;
  if (!pending || pending.testId !== requestedTestId) return null;

  const expired = Date.now() - Date.parse(pending.createdAt) > 10 * 60 * 1000;
  if (expired && pending.status === 'pending') {
    pending.status = 'failed';
    pending.errorMessage = 'The provider credential test expired before completion.';
    delete pending.clientSecret;
  }

  return {
    success: true,
    testId: pending.testId,
    provider: pending.provider,
    status: pending.status,
    message:
      pending.status === 'verified'
        ? 'Provider credentials tested successfully. Save to commit this verified credential pair.'
        : pending.status === 'failed'
          ? (pending.errorMessage ?? 'The provider rejected the proposed credentials.')
          : 'Waiting for the provider credential test to complete.',
    ...(pending.verifiedAt ? { verifiedAt: pending.verifiedAt } : {}),
    ...(pending.status === 'verified' ? { verificationProofId: pending.testId } : {}),
  };
}

export function cancelExternalProviderCredentialTest(req: Request): void {
  const requestedTestId = String(req.body.testId ?? '');
  const pending = req.session.pendingExtAuthCredentialTest;
  if (pending && pending.testId === requestedTestId)
    delete req.session.pendingExtAuthCredentialTest;
}

/** Rebuild the runtime registry only after provider configuration changes. */
export async function refreshExternalProviderRuntime(): Promise<void> {
  await refreshExternalProviderRegistry();
  configurePassport();
}

/**
 * Handle provider credential side effects at the generic Save boundary.
 * Returns a saved id when the credential action fully handles persistence;
 * null means ordinary metadata-driven CRUD should continue.
 */
export async function handleExternalProviderCredentialSave(
  req: Request,
  definition: SysBODefinition,
  id: string,
): Promise<string | null> {
  if (definition.key !== 'sys-ext-auth-providers') return null;

  const apiPath = apiPathFor(definition.key);
  const pending = req.session.pendingExtAuthCredentialTest;
  const action = String(req.body.providerCredentialAction ?? 'unchanged');
  const proofId = String(req.body.providerVerificationProofId ?? '');

  let provider = String(req.body.provider ?? '')
    .trim()
    .toLowerCase();
  if (id) {
    const existingProvider = await apiClient.get<Record<string, unknown>>(
      `/api/v1/${apiPath}/${encodeURIComponent(id)}`,
      apiSessionOptions(req),
    );
    provider = String(existingProvider.data.provider ?? '')
      .trim()
      .toLowerCase();
  }

  if (!['unchanged', 'replace', 'remove'].includes(action)) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Unsupported provider credential action.',
      'The credential change could not be saved.',
      false,
    );
  }

  if (action === 'remove') {
    if (id) {
      await apiClient.delete(
        `/api/v1/internal/external-auth-providers/${encodeURIComponent(id)}/credentials`,
        { ...apiSessionOptions(req), internal: true },
      );
    }
    delete req.session.pendingExtAuthCredentialTest;
    await refreshExternalProviderRuntime();
    return id;
  }

  if (action !== 'replace') return null;

  const clientId = String(req.body.clientId ?? '').trim();
  const clientSecret = String(req.body.clientSecret ?? '');
  if (!clientId || !clientSecret) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Client ID and Client secret must be saved together.',
      'Enter both Client ID and Client secret.',
      false,
    );
  }

  const proofMatches =
    Boolean(proofId) &&
    pending?.status === 'verified' &&
    pending.testId === proofId &&
    pending.provider === provider &&
    (pending.recordId ?? '') === id &&
    pending.clientId === clientId &&
    pending.clientSecret === clientSecret &&
    Date.now() - Date.parse(pending.createdAt) <= 10 * 60 * 1000;

  const credentialEndpoint = proofMatches
    ? '/api/v1/internal/external-auth-providers/verified-credentials'
    : '/api/v1/internal/external-auth-providers/stored-credentials';

  const credentialSave = await apiClient.post<{ id?: string }>(
    credentialEndpoint,
    {
      ...(id ? { id } : {}),
      provider,
      enabled:
        req.body.enabled === 'on' || req.body.enabled === 'true' || req.body.enabled === true,
      clientId,
      clientSecret,
      callbackPath: req.body.callbackPath,
      ...(req.body.tenant ? { tenant: req.body.tenant } : {}),
    },
    { ...apiSessionOptions(req), internal: true },
  );

  delete req.session.pendingExtAuthCredentialTest;
  await refreshExternalProviderRuntime();
  return id || String(credentialSave.data.id ?? '');
}
