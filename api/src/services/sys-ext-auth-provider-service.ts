import {
  ConflictError,
  SysExtAuthProviderType,
  ValidationAppError,
  sysExtAuthProvidersMetadata,
  type SysExtAuthProvider,
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

export interface SaveSysExtAuthProviderInput {
  provider?: unknown;
  enabled?: unknown;
  clientId?: unknown;
  clientSecret?: unknown;
  callbackPath?: unknown;
  tenant?: unknown;
}

/** Credentials that the trusted UI has just verified through the real OAuth flow. */
export interface SaveVerifiedSysExtAuthProviderInput {
  id?: unknown;
  provider?: unknown;
  enabled?: unknown;
  clientId?: unknown;
  clientSecret?: unknown;
  callbackPath?: unknown;
  tenant?: unknown;
}

export interface RuntimeExternalAuthProvider {
  provider: SysExtAuthProviderType;
  label: string;
  icon: string;
  scope: string[];
  clientId: string;
  clientSecret: string;
  callbackPath: string;
  tenant?: string;
}

export interface PublicExternalAuthProvider {
  provider: SysExtAuthProviderType;
  label: string;
  icon: string;
  enabled: boolean;
  configured: boolean;
}

export class SysExtAuthProviderService extends GenericSysBOService<SysExtAuthProvider> {
  constructor(
    store: InMemoryDataStore,
    private readonly encryption: SecretsEncryptionService,
  ) {
    super(store, store.sysExtAuthProviders, sysExtAuthProvidersMetadata);
  }

  /**
   * Generic creation deliberately cannot accept provider credentials.
   * Credentials are committed only by saveVerifiedCredentials(), after the
   * trusted UI has completed the provider's real OAuth authorization flow.
   */
  async createProvider(input: SaveSysExtAuthProviderInput, actor: AuditActor): Promise<SysExtAuthProvider> {
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

    if (enabled) {
      throw new ValidationAppError(
        'A new enabled external authentication provider must have successfully tested credentials.',
        'Test the provider credentials successfully before saving an enabled provider, or save it disabled as a draft.',
      );
    }

    return this.create(
      {
        name: provider,
        provider,
        enabled: false,
        clientId: '',
        callbackPath: providerCallbackPath(input.callbackPath, definition.callbackPath),
        ...(provider === SysExtAuthProviderType.Microsoft
          ? { tenant: normalizeMicrosoftTenant(input.tenant) }
          : {}),
      },
      actor,
    );
  }

  /**
   * Generic edits may change ordinary provider settings only. Client ID and
   * Client secret are a single credential pair and cannot be altered through
   * the generic CRUD path; doing so would bypass end-to-end verification.
   */
  async updateProvider(id: string, input: SaveSysExtAuthProviderInput, actor: AuditActor): Promise<SysExtAuthProvider> {
    const existing = await this.get(id);

    if (!existing) {
      throw new ValidationAppError(`SysExtAuthProvider '${id}' was not found.`);
    }

    const provider = input.provider === undefined ? existing.provider : parseProvider(input.provider);

    if (provider !== existing.provider) {
      throw new ValidationAppError('The provider type cannot be changed after creation.');
    }

    rejectCredentialChangeAgainstExisting(input, existing);

    const definition = externalAuthProviderDefinitionFor(provider);
    const enabled = input.enabled !== undefined ? Boolean(input.enabled) : existing.enabled;

    if (enabled && !credentialsConfigured(existing)) {
      throw new ValidationAppError(
        'This provider does not have successfully verified credentials.',
        'Test and save the Client ID and Client secret before enabling this provider.',
      );
    }

    return this.update(
      id,
      {
        name: provider,
        provider,
        ...(input.enabled !== undefined ? { enabled } : {}),
        callbackPath: providerCallbackPath(input.callbackPath, definition.callbackPath),
        ...(provider === SysExtAuthProviderType.Microsoft
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
    input: SaveVerifiedSysExtAuthProviderInput,
    actor: AuditActor,
  ): Promise<SysExtAuthProvider> {
    const provider = parseProvider(input.provider);
    const clientId = requiredText(input.clientId, 'Client ID');
    const clientSecret = requiredText(input.clientSecret, 'Client secret');
    const definition = externalAuthProviderDefinitionFor(provider);
    const verifiedAt = new Date().toISOString();
    const requestedId = optionalText(input.id);

    if (requestedId) {
      const existing = await this.get(requestedId);

      if (!existing) {
        throw new ValidationAppError(`SysExtAuthProvider '${requestedId}' was not found.`);
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
          credentialsVerifiedAt: verifiedAt,
          callbackPath: providerCallbackPath(input.callbackPath, definition.callbackPath),
          ...(provider === SysExtAuthProviderType.Microsoft
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
        credentialsVerifiedAt: verifiedAt,
        callbackPath: providerCallbackPath(input.callbackPath, definition.callbackPath),
        ...(provider === SysExtAuthProviderType.Microsoft
          ? { tenant: normalizeMicrosoftTenant(input.tenant) }
          : {}),
      },
      actor,
    );
  }

  /** Remove the complete credential pair and disable the provider atomically. */
  async removeCredentials(id: string, actor: AuditActor): Promise<SysExtAuthProvider> {
    const existing = await this.get(id);

    if (!existing) {
      throw new ValidationAppError(`SysExtAuthProvider '${id}' was not found.`);
    }

    return this.update(
      id,
      {
        enabled: false,
        clientId: '',
        clientSecretEncrypted: null,
        secretUpdatedAt: null,
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
        configured: Boolean(enabled && item && credentialsConfigured(item)),
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
      if (!item.enabled || !credentialsConfigured(item) || !item.clientSecretEncrypted) {
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
          ...(item.provider === SysExtAuthProviderType.Microsoft ? { tenant: 'common' } : {}),
        },
      ];
    });
  }
}

function credentialsConfigured(item: SysExtAuthProvider): boolean {
  if (!item.clientId.trim() || !item.clientSecretEncrypted || !item.credentialsVerifiedAt) {
    return false;
  }

  const definition = externalAuthProviderDefinitionFor(item.provider);
  return item.callbackPath === definition.callbackPath;
}

function rejectDirectCredentialMutation(input: SaveSysExtAuthProviderInput): void {
  if (optionalText(input.clientId) || optionalText(input.clientSecret)) {
    throw new ValidationAppError(
      'Provider credentials must be tested before they can be stored.',
      'Use Test credentials before saving Client ID and Client secret.',
    );
  }
}

function rejectCredentialChangeAgainstExisting(
  input: SaveSysExtAuthProviderInput,
  existing: SysExtAuthProvider,
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

function parseProvider(value: unknown): SysExtAuthProviderType {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (!Object.values(SysExtAuthProviderType).includes(normalized as SysExtAuthProviderType)) {
    throw new ValidationAppError(`Unsupported external authentication provider '${normalized}'.`);
  }

  return normalized as SysExtAuthProviderType;
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
