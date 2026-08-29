import {
  ConflictError,
  SysBOExtAuthProviderType,
  ValidationAppError,
  sysBOExtAuthProvidersMetadata,
  type SysBOExtAuthProvider,
} from '@manatos/shared';

import type { AuditActor } from '../audit/audit-service.js';
import {
  externalAuthProviderDefinitionFor,
  externalAuthProviderDefinitions,
  type ExternalAuthProviderDefinition,
} from '../auth/external-auth-provider-definitions.js';
import type { SecretsEncryptionService } from '../security/secrets-encryption-service.js';
import type { InMemoryDataStore } from '../storage/in-memory-data-store.js';
import { GenericSysBOService } from './generic-sysbo-service.js';

export interface SaveSysBOExtAuthProviderInput {
  provider?: unknown;
  enabled?: unknown;
  clientId?: unknown;
  clientSecret?: unknown;
  callbackPath?: unknown;
  tenant?: unknown;
}

/** Credentials that the trusted UI has just verified through the real OAuth flow. */
export interface SaveVerifiedSysBOExtAuthProviderInput {
  id?: unknown;
  provider?: unknown;
  enabled?: unknown;
  clientId?: unknown;
  clientSecret?: unknown;
  callbackPath?: unknown;
  tenant?: unknown;
}

/**
 * A complete provider credential pair that an Admin wants to persist even
 * though it has not yet passed the provider OAuth verification flow.
 *
 * Stored and verified are deliberately separate states: the pair is encrypted
 * at rest in both cases, while credentialsVerifiedAt is populated only after a
 * successful provider test.
 */
export type SaveStoredSysBOExtAuthProviderInput = SaveVerifiedSysBOExtAuthProviderInput;

export interface StoredExternalAuthCredentialMaterial {
  id: string;
  provider: SysBOExtAuthProviderType;
  clientId: string;
  clientSecret: string;
  secretUpdatedAt: string;
  callbackPath: string;
  tenant?: string;
}

export interface RuntimeExternalAuthProvider {
  provider: SysBOExtAuthProviderType;
  label: string;
  icon: string;
  scope: string[];
  clientId: string;
  clientSecret: string;
  callbackPath: string;
  tenant?: string;
}

export interface PublicExternalAuthProvider {
  provider: SysBOExtAuthProviderType;
  label: string;
  icon: string;
  enabled: boolean;
  configured: boolean;
}

export class SysBOExtAuthProviderService extends GenericSysBOService<SysBOExtAuthProvider> {
  constructor(
    store: InMemoryDataStore,
    private readonly encryption: SecretsEncryptionService,
  ) {
    super(store, store.sysExtAuthProviders, sysBOExtAuthProvidersMetadata);
  }

  /**
   * Generic creation deliberately cannot accept provider credentials.
   * Plaintext credentials are committed only through the trusted internal
   * stored/verified commands so the secret can be encrypted immediately and
   * never appear in normal SysBO CRUD responses.
   */
  async createProvider(input: SaveSysBOExtAuthProviderInput, actor: AuditActor): Promise<SysBOExtAuthProvider> {
    const provider = parseProvider(input.provider);

    if (await this.repository.findByUnique('provider', provider)) {
      throw new ConflictError(
        'EXT_AUTH_PROVIDER_EXISTS',
        `External provider '${provider}' already exists.`,
        'That external authentication provider is already configured.',
      );
    }

    rejectDirectCredentialMutation(input);

    const definition = externalAuthProviderDefinitionFor(provider);
    const enabled = input.enabled === true;

    return this.create(
      {
        name: provider,
        provider,
        enabled,
        clientId: '',
        credentialsVerified: false,
        credentialsVerifiedAt: null,
        callbackPath: providerCallbackPath(input.callbackPath, definition.callbackPath),
        ...(provider === SysBOExtAuthProviderType.Microsoft
          ? { tenant: normalizeMicrosoftTenant(input.tenant) }
          : {}),
      },
      actor,
    );
  }

  /**
   * Generic edits may change ordinary provider settings only. Client ID and
   * Client secret are a single credential pair and cannot be altered through
   * generic CRUD; the trusted internal credential commands own encryption and
   * verification-state transitions.
   */
  async updateProvider(id: string, input: SaveSysBOExtAuthProviderInput, actor: AuditActor): Promise<SysBOExtAuthProvider> {
    const existing = await this.get(id);

    if (!existing) {
      throw new ValidationAppError(`SysBOExtAuthProvider '${id}' was not found.`);
    }

    const provider = input.provider === undefined ? existing.provider : parseProvider(input.provider);

    if (provider !== existing.provider) {
      throw new ValidationAppError('The provider type cannot be changed after creation.');
    }

    rejectCredentialChangeAgainstExisting(input, existing);

    const definition = externalAuthProviderDefinitionFor(provider);
    const enabled = input.enabled !== undefined ? Boolean(input.enabled) : existing.enabled;

    return this.update(
      id,
      {
        name: provider,
        provider,
        ...(input.enabled !== undefined ? { enabled } : {}),
        callbackPath: providerCallbackPath(input.callbackPath, definition.callbackPath),
        ...(provider === SysBOExtAuthProviderType.Microsoft
          ? { tenant: normalizeMicrosoftTenant(input.tenant ?? existing.tenant) }
          : {}),
      },
      actor,
    );
  }

  /**
   * Atomically commit a Client ID + Client secret pair that the trusted UI has
   * already verified through the real provider authorization-code flow.
   *
   * This command is intentionally exposed only through the internal+Admin API
   * route. The public/generic SysBO API cannot self-assert verification.
   */
  async saveVerifiedCredentials(
    input: SaveVerifiedSysBOExtAuthProviderInput,
    actor: AuditActor,
  ): Promise<SysBOExtAuthProvider> {
    const provider = parseProvider(input.provider);
    const clientId = requiredText(input.clientId, 'Client ID');
    const clientSecret = requiredText(input.clientSecret, 'Client secret');
    const definition = externalAuthProviderDefinitionFor(provider);
    const verifiedAt = new Date().toISOString();
    const requestedId = optionalText(input.id);

    if (requestedId) {
      const existing = await this.get(requestedId);

      if (!existing) {
        throw new ValidationAppError(`SysBOExtAuthProvider '${requestedId}' was not found.`);
      }

      if (existing.provider !== provider) {
        throw new ValidationAppError('The tested provider does not match the existing provider record.');
      }

      return this.update(
        requestedId,
        {
          name: provider,
          provider,
          enabled: input.enabled !== false,
          clientId,
          clientSecretEncrypted: this.encryption.encrypt(clientSecret),
          secretUpdatedAt: verifiedAt,
          credentialsVerified: true,
        credentialsVerifiedAt: verifiedAt,
          callbackPath: providerCallbackPath(input.callbackPath, definition.callbackPath),
          ...(provider === SysBOExtAuthProviderType.Microsoft
            ? { tenant: normalizeMicrosoftTenant(input.tenant ?? existing.tenant) }
            : {}),
        },
        actor,
      );
    }

    if (await this.repository.findByUnique('provider', provider)) {
      throw new ConflictError(
        'EXT_AUTH_PROVIDER_EXISTS',
        `External provider '${provider}' already exists.`,
        'That external authentication provider is already configured.',
      );
    }

    return this.create(
      {
        name: provider,
        provider,
        enabled: input.enabled !== false,
        clientId,
        clientSecretEncrypted: this.encryption.encrypt(clientSecret),
        secretUpdatedAt: verifiedAt,
        credentialsVerified: true,
          credentialsVerifiedAt: verifiedAt,
        callbackPath: providerCallbackPath(input.callbackPath, definition.callbackPath),
        ...(provider === SysBOExtAuthProviderType.Microsoft
          ? { tenant: normalizeMicrosoftTenant(input.tenant) }
          : {}),
      },
      actor,
    );
  }

  /**
   * Persist a complete Client ID + Client secret pair without asserting that
   * the provider has accepted it yet.
   *
   * This is intentionally an internal/Admin command rather than generic CRUD:
   * the plaintext secret crosses only the trusted UI -> API boundary and is
   * encrypted immediately. Any previous verification stamp is cleared because
   * changing either credential creates a new, unverified pair.
   */
  async saveStoredCredentials(
    input: SaveStoredSysBOExtAuthProviderInput,
    actor: AuditActor,
  ): Promise<SysBOExtAuthProvider> {
    const provider = parseProvider(input.provider);
    const clientId = requiredText(input.clientId, 'Client ID');
    const clientSecret = requiredText(input.clientSecret, 'Client secret');
    const definition = externalAuthProviderDefinitionFor(provider);
    const updatedAt = new Date().toISOString();
    const requestedId = optionalText(input.id);

    if (requestedId) {
      const existing = await this.get(requestedId);

      if (!existing) {
        throw new ValidationAppError(`SysBOExtAuthProvider '${requestedId}' was not found.`);
      }

      if (existing.provider !== provider) {
        throw new ValidationAppError('The provider does not match the existing provider record.');
      }

      return this.update(
        requestedId,
        {
          name: provider,
          provider,
          enabled: input.enabled !== false,
          clientId,
          clientSecretEncrypted: this.encryption.encrypt(clientSecret),
          secretUpdatedAt: updatedAt,
          credentialsVerified: false,
        credentialsVerifiedAt: null,
          callbackPath: providerCallbackPath(input.callbackPath, definition.callbackPath),
          ...(provider === SysBOExtAuthProviderType.Microsoft
            ? { tenant: normalizeMicrosoftTenant(input.tenant ?? existing.tenant) }
            : {}),
        },
        actor,
      );
    }

    if (await this.repository.findByUnique('provider', provider)) {
      throw new ConflictError(
        'EXT_AUTH_PROVIDER_EXISTS',
        `External provider '${provider}' already exists.`,
        'That external authentication provider is already configured.',
      );
    }

    return this.create(
      {
        name: provider,
        provider,
        enabled: input.enabled !== false,
        clientId,
        clientSecretEncrypted: this.encryption.encrypt(clientSecret),
        secretUpdatedAt: updatedAt,
        credentialsVerified: false,
          credentialsVerifiedAt: null,
        callbackPath: providerCallbackPath(input.callbackPath, definition.callbackPath),
        ...(provider === SysBOExtAuthProviderType.Microsoft
          ? { tenant: normalizeMicrosoftTenant(input.tenant) }
          : {}),
      },
      actor,
    );
  }

  /**
   * Decrypt one already-stored pair for the trusted UI server to run the real
   * provider test. The plaintext is never exposed by normal Admin CRUD or sent
   * to browser JavaScript.
   */
  async storedCredentialMaterial(id: string): Promise<StoredExternalAuthCredentialMaterial> {
    const existing = await this.get(id);

    if (!existing || !existing.clientId.trim() || !existing.clientSecretEncrypted || !existing.secretUpdatedAt) {
      throw new ValidationAppError('This provider does not have a complete stored credential pair.');
    }

    return {
      id: existing.id,
      provider: existing.provider,
      clientId: existing.clientId,
      clientSecret: this.encryption.decrypt(existing.clientSecretEncrypted),
      secretUpdatedAt: existing.secretUpdatedAt,
      callbackPath: externalAuthProviderDefinitionFor(existing.provider).callbackPath,
      ...(existing.provider === SysBOExtAuthProviderType.Microsoft
        ? { tenant: normalizeMicrosoftTenant(existing.tenant) }
        : {}),
    };
  }

  /**
   * Mark the exact stored credential version that just passed OAuth testing as
   * verified. The optimistic version checks prevent an older popup from
   * verifying credentials that another Admin replaced while the test ran.
   */
  async markStoredCredentialsVerified(
    id: string,
    expectedClientId: string,
    expectedSecretUpdatedAt: string,
    actor: AuditActor,
  ): Promise<SysBOExtAuthProvider> {
    const existing = await this.get(id);

    if (!existing || !existing.clientSecretEncrypted) {
      throw new ValidationAppError('The stored provider credentials are no longer available.');
    }

    if (existing.clientId !== expectedClientId || existing.secretUpdatedAt !== expectedSecretUpdatedAt) {
      throw new ConflictError(
        'EXT_AUTH_PROVIDER_CREDENTIALS_CHANGED',
        'The provider credentials changed while verification was in progress.',
        'The stored credentials changed during testing. Test the current pair again.',
      );
    }

    return this.update(
      id,
      { credentialsVerified: true, credentialsVerifiedAt: new Date().toISOString() },
      actor,
    );
  }

  /** Remove the complete credential pair and disable the provider atomically. */
  async removeCredentials(id: string, actor: AuditActor): Promise<SysBOExtAuthProvider> {
    const existing = await this.get(id);

    if (!existing) {
      throw new ValidationAppError(`SysBOExtAuthProvider '${id}' was not found.`);
    }

    return this.update(
      id,
      {
        enabled: false,
        clientId: '',
        clientSecretEncrypted: null,
        secretUpdatedAt: null,
        credentialsVerified: false,
          credentialsVerifiedAt: null,
      },
      actor,
    );
  }

  providerDefinitions(): ExternalAuthProviderDefinition[] {
    return Object.values(externalAuthProviderDefinitions);
  }

  async publicProviderState(): Promise<PublicExternalAuthProvider[]> {
    const result = await this.list({
      page: 1,
      pageSize: 100,
      filters: {},
      sort: 'name',
      direction: 'asc',
    });

    const records = new Map(result.items.map((item) => [item.provider, item]));

    return Object.values(externalAuthProviderDefinitions).map((definition) => {
      const item = records.get(definition.provider);
      const enabled = item?.enabled === true;

      return {
        provider: definition.provider,
        label: definition.label,
        icon: definition.icon,
        enabled,
        configured: Boolean(enabled && item && credentialsReadyForRuntime(item)),
      };
    });
  }

  async resolveConfiguredProviders(): Promise<RuntimeExternalAuthProvider[]> {
    const result = await this.list({
      page: 1,
      pageSize: 100,
      filters: {},
      sort: 'name',
      direction: 'asc',
    });

    return result.items.flatMap((item) => {
      if (!item.enabled || !credentialsReadyForRuntime(item) || !item.clientSecretEncrypted) {
        return [];
      }

      const definition = externalAuthProviderDefinitionFor(item.provider);

      return [
        {
          provider: item.provider,
          label: definition.label,
          icon: definition.icon,
          scope: definition.scope,
          clientId: item.clientId,
          clientSecret: this.encryption.decrypt(item.clientSecretEncrypted),
          callbackPath: definition.callbackPath,
          ...(item.provider === SysBOExtAuthProviderType.Microsoft ? { tenant: 'common' } : {}),
        },
      ];
    });
  }
}

function credentialsReadyForRuntime(item: SysBOExtAuthProvider): boolean {
  if (!item.credentialsVerified || !item.clientId.trim() || !item.clientSecretEncrypted || !item.credentialsVerifiedAt) {
    return false;
  }

  const definition = externalAuthProviderDefinitionFor(item.provider);
  return item.callbackPath === definition.callbackPath;
}

function rejectDirectCredentialMutation(input: SaveSysBOExtAuthProviderInput): void {
  if (optionalText(input.clientId) || optionalText(input.clientSecret)) {
    throw new ValidationAppError(
      'Provider credentials cannot be changed through generic CRUD.',
      'Use the External authentication Secrets tab to store or test the Client ID and Client secret pair.',
    );
  }
}

function rejectCredentialChangeAgainstExisting(
  input: SaveSysBOExtAuthProviderInput,
  existing: SysBOExtAuthProvider,
): void {
  const suppliedClientId = input.clientId === undefined ? undefined : optionalText(input.clientId) ?? '';
  const suppliedSecret = optionalText(input.clientSecret);

  if ((suppliedClientId !== undefined && suppliedClientId !== existing.clientId) || suppliedSecret) {
    throw new ValidationAppError(
      'Client ID and Client secret must be changed and verified together.',
      'Choose Change credentials, provide both values, and complete Test credentials before saving.',
    );
  }
}

function parseProvider(value: unknown): SysBOExtAuthProviderType {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (!Object.values(SysBOExtAuthProviderType).includes(normalized as SysBOExtAuthProviderType)) {
    throw new ValidationAppError(`Unsupported external authentication provider '${normalized}'.`);
  }

  return normalized as SysBOExtAuthProviderType;
}

function providerCallbackPath(value: unknown, expected: string): string {
  const supplied = optionalText(value);

  if (supplied !== undefined && supplied !== expected) {
    throw new ValidationAppError(
      `Callback path for this provider is fixed to '${expected}' and cannot be changed.`,
    );
  }

  return expected;
}

function normalizeMicrosoftTenant(value: unknown): string {
  const tenant = optionalText(value) ?? 'common';

  if (tenant.toLowerCase() !== 'common') {
    throw new ValidationAppError("Microsoft tenant currently supports only 'common'.");
  }

  return 'common';
}

function requiredText(value: unknown, label: string): string {
  const text = optionalText(value);

  if (!text) {
    throw new ValidationAppError(`${label} is required.`);
  }

  return text;
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const text = String(value).trim();
  return text || undefined;
}
