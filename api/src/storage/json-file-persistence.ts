import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

import { dirname, join, resolve } from 'node:path';

import {
  PROTOCRM_PLATFORM_ID,
  StorageAppError,
  type SysBOExtAuthProvider,
  type SysBOLicense,
} from '@manatos/shared';
import { operationContext } from '@manatos/shared/node';

import { emptyDatabaseState, type DatabaseState, type PersistedDatabaseState } from './types.js';

/**
 * JSON persistence used only by the in-memory storage adapter.
 */
export class JsonFilePersistence {
  private readonly filePath: string;

  private readonly binaryRootPath: string;

  constructor(filePath: string, binaryRoot?: string) {
    this.filePath = resolve(process.cwd(), filePath);
    this.binaryRootPath = binaryRoot
      ? resolve(process.cwd(), binaryRoot)
      : join(dirname(this.filePath), 'images');
  }

  /** Binary assets belonging to the JSON-backed adapter use the configured filesystem root. */
  pictureRootDirectory(): string {
    return this.binaryRootPath;
  }

  /**
   * Load the persisted database from disk.
   *
   * If the file does not exist yet, return a completely empty
   * database state rather than treating that as an error.
   */
  async load(): Promise<DatabaseState> {
    return operationContext.run('Load datastore snapshot', async (scope) => {
      scope.comment('filePath', this.filePath);

      try {
        const serialized = await operationContext.run('Read datastore file', async () =>
          readFile(this.filePath, 'utf8'),
        );
        const raw = JSON.parse(serialized) as PersistedDatabaseState;
        const identityMigrationChanged = migrateLegacyUserPrincipalIdentity(raw);
        const principalRootMigrationChanged = migrateLegacyPrincipalRootField(raw);

        const state: DatabaseState = {
          sysUsers: fromPersistedRecords(raw.sysUsers),

          sysPrincipals: fromPersistedRecords(raw.sysPrincipals),

          sysEmailAddresses: fromPersistedRecords(raw.sysEmailAddresses),
          sysPrincipalEmailAddresses: fromPersistedRecords(raw.sysPrincipalEmailAddresses),
          sysTelephoneNumbers: fromPersistedRecords(raw.sysTelephoneNumbers),
          sysPrincipalTelephoneNumbers: fromPersistedRecords(raw.sysPrincipalTelephoneNumbers),
          sysAddresses: fromPersistedRecords(raw.sysAddresses),
          sysPrincipalAddresses: fromPersistedRecords(raw.sysPrincipalAddresses),

          sysApplications: fromPersistedRecords(raw.sysApplications),
          sysGuards: fromPersistedRecords(raw.sysGuards),
          sysProjects: fromPersistedRecords(raw.sysProjects),
          sysPosts: fromPersistedRecords(raw.sysPosts),

          sysConfigurations: fromPersistedRecords(raw.sysConfigurations),

          sysLicenses: normalizeLegacyLicenses(fromPersistedRecords(raw.sysLicenses)),

          sysExtAuthProviders: normalizeLegacyExternalAuthProviders(
            fromPersistedRecords(raw.sysExtAuthProviders),
          ),

          sysExternalIdentities: fromPersistedRecords(raw.sysExternalIdentities),

          sysUserInvitations: fromPersistedRecords(raw.sysUserInvitations),
        };

        // 18B is a persisted-schema migration, not merely a runtime normalization.
        // Once a legacy User.principalId has been moved to Principal.userId, make
        // the canonical shape durable immediately during startup.
        if (identityMigrationChanged || principalRootMigrationChanged) {
          await this.save(state);
        }

        return state;
      } catch (error) {
        /*
         * A missing database file simply means that this is the first
         * execution of the in-memory store.
         */
        if (isNodeError(error) && error.code === 'ENOENT') {
          return emptyDatabaseState();
        }

        throw new StorageAppError(`Failed to load '${this.filePath}'.`, error);
      }
    });
  }

  /**
   * Persist the complete current in-memory state.
   *
   * Data is first written to a temporary file and then renamed over
   * the actual database file. This reduces the chance of leaving a
   * partially written JSON database behind.
   */
  async save(state: DatabaseState): Promise<void> {
    await operationContext.run('Persist datastore snapshot', async (scope) => {
      scope.comment('filePath', this.filePath);

      const persisted: PersistedDatabaseState = {
        sysUsers: toPersistedRecords(state.sysUsers),

        sysPrincipals: toPersistedRecords(state.sysPrincipals),

        sysEmailAddresses: toPersistedRecords(state.sysEmailAddresses),
        sysPrincipalEmailAddresses: toPersistedRecords(state.sysPrincipalEmailAddresses),
        sysTelephoneNumbers: toPersistedRecords(state.sysTelephoneNumbers),
        sysPrincipalTelephoneNumbers: toPersistedRecords(state.sysPrincipalTelephoneNumbers),
        sysAddresses: toPersistedRecords(state.sysAddresses),
        sysPrincipalAddresses: toPersistedRecords(state.sysPrincipalAddresses),

        sysApplications: toPersistedRecords(state.sysApplications),
        sysGuards: toPersistedRecords(state.sysGuards),
        sysProjects: toPersistedRecords(state.sysProjects),
        sysPosts: toPersistedRecords(state.sysPosts),

        sysConfigurations: toPersistedRecords(state.sysConfigurations),

        sysLicenses: toPersistedRecords(state.sysLicenses),

        sysExtAuthProviders: toPersistedRecords(state.sysExtAuthProviders),

        sysExternalIdentities: toPersistedRecords(state.sysExternalIdentities),

        sysUserInvitations: toPersistedRecords(state.sysUserInvitations),
      };

      const temporaryFilePath = `${this.filePath}.tmp`;

      try {
        await mkdir(dirname(this.filePath), {
          recursive: true,
        });

        await operationContext.run('Write temporary datastore file', async () =>
          writeFile(temporaryFilePath, JSON.stringify(persisted, null, 2) + '\n', 'utf8'),
        );

        await operationContext.run('Replace datastore file', async () =>
          rename(temporaryFilePath, this.filePath),
        );
      } catch (error) {
        throw new StorageAppError(`Failed to persist '${this.filePath}'.`, error);
      }
    });
  }
}

/** Migrate the persisted Principal hierarchy cache from rootPrincipalId to rootId. */
function migrateLegacyPrincipalRootField(raw: PersistedDatabaseState): boolean {
  let changed = false;
  for (const persistedPrincipal of Object.values(raw.sysPrincipals ?? {})) {
    const principal = persistedPrincipal as typeof persistedPrincipal & {
      rootId?: string | null;
      rootPrincipalId?: string | null;
    };
    if (Object.prototype.hasOwnProperty.call(principal, 'rootPrincipalId')) {
      if (!Object.prototype.hasOwnProperty.call(principal, 'rootId')) {
        principal.rootId = principal.rootPrincipalId ?? null;
      }
      delete principal.rootPrincipalId;
      changed = true;
    }
  }
  return changed;
}

/**
 * Migrate snapshots written while SysUser.principalId owned the optional 1:1
 * website-account identity relationship. Principal.userId is now the sole
 * persisted endpoint; never retain both directions in memory or on the next save.
 */
function migrateLegacyUserPrincipalIdentity(raw: PersistedDatabaseState): boolean {
  const users = raw.sysUsers ?? {};
  const principals = raw.sysPrincipals ?? {};
  const claimedUsers = new Map<string, string>();

  // Validate any already-migrated Principal.userId endpoints first. This makes
  // repeated loads idempotent while refusing a partially corrupt relationship.
  for (const [principalId, persistedPrincipal] of Object.entries(principals)) {
    const principal = persistedPrincipal as typeof persistedPrincipal & { userId?: string | null };
    if (!principal.userId) continue;
    if (principal.principalType !== 'Person') {
      throw new StorageAppError(
        `Identity migration conflict: non-Person Principal '${principalId}' is linked to User '${principal.userId}'.`,
      );
    }
    if (!users[principal.userId]) {
      throw new StorageAppError(
        `Identity migration conflict: Principal '${principalId}' references missing User '${principal.userId}'.`,
      );
    }
    const previousPrincipalId = claimedUsers.get(principal.userId);
    if (previousPrincipalId && previousPrincipalId !== principalId) {
      throw new StorageAppError(
        `Identity migration conflict: User '${principal.userId}' is linked to both Principals '${previousPrincipalId}' and '${principalId}'.`,
      );
    }
    claimedUsers.set(principal.userId, principalId);
  }

  // Validate every legacy User.principalId before mutating the snapshot. A bad
  // legacy link must never disappear merely because the new owner is Principal.
  const legacyLinks: Array<{ userId: string; principalId: string }> = [];
  for (const [userId, persistedUser] of Object.entries(users)) {
    const legacyUser = persistedUser as typeof persistedUser & { principalId?: string | null };
    if (!legacyUser.principalId) continue;
    const principalId = legacyUser.principalId;
    const persistedPrincipal = principals[principalId];
    if (!persistedPrincipal) {
      throw new StorageAppError(
        `Legacy identity migration conflict: User '${userId}' references missing Principal '${principalId}'.`,
      );
    }
    if (persistedPrincipal.principalType !== 'Person') {
      throw new StorageAppError(
        `Legacy identity migration conflict: User '${userId}' references non-Person Principal '${principalId}'.`,
      );
    }
    const principal = persistedPrincipal as typeof persistedPrincipal & { userId?: string | null };
    if (principal.userId && principal.userId !== userId) {
      throw new StorageAppError(
        `Legacy identity migration conflict: Principal '${principalId}' is linked to both Users '${principal.userId}' and '${userId}'.`,
      );
    }
    const previousPrincipalId = claimedUsers.get(userId);
    if (previousPrincipalId && previousPrincipalId !== principalId) {
      throw new StorageAppError(
        `Legacy identity migration conflict: User '${userId}' is linked to both Principals '${previousPrincipalId}' and '${principalId}'.`,
      );
    }
    claimedUsers.set(userId, principalId);
    legacyLinks.push({ userId, principalId });
  }

  for (const { userId, principalId } of legacyLinks) {
    const principal = principals[principalId] as (typeof principals)[string] & {
      userId?: string | null;
    };
    principal.userId = userId;
  }
  let changed = legacyLinks.length > 0;
  for (const persistedUser of Object.values(users)) {
    const legacyUser = persistedUser as typeof persistedUser & { principalId?: string | null };
    if (Object.prototype.hasOwnProperty.call(legacyUser, 'principalId')) {
      delete legacyUser.principalId;
      changed = true;
    }
  }

  return changed;
}

/**
 * Reconstruct runtime entities from their persisted JSON representation.
 *
 * The JSON object's property name is the single persisted source of truth
 * for the entity ID.
 */
function fromPersistedRecords<T extends { id: string }>(
  records: Record<string, Omit<T, 'id'>> | undefined,
): Map<string, T> {
  return new Map(
    Object.entries(records ?? {}).map(([id, record]) => [
      id,
      {
        ...record,
        id,
      } as T,
    ]),
  );
}

/**
 * Convert runtime entities into their JSON representation.
 *
 * entity.id becomes the JSON object's property name and is deliberately
 * omitted from the persisted value, avoiding duplicate ID storage.
 */
function toPersistedRecords<T extends { id: string }>(
  records: Map<string, T>,
): Record<string, Omit<T, 'id'>> {
  return Object.fromEntries(
    [...records.values()].map((record) => {
      const { id, ...persistedRecord } = record;

      return [id, persistedRecord];
    }),
  ) as Record<string, Omit<T, 'id'>>;
}

/**
 * Type guard for Node.js filesystem errors.
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * Backward-compatible normalization for databases written before platform ownership was introduced or while protoCRM still used
 * the legacy 'mcrm' platform id. Those records necessarily refer to protoCRM, so
 * the migration is deterministic and does not require a
 * destructive database rebuild.
 */
function normalizeLegacyLicenses(records: Map<string, SysBOLicense>): Map<string, SysBOLicense> {
  for (const [id, license] of records) {
    if (!license.platformId || license.platformId === 'mcrm') {
      records.set(id, {
        ...license,
        platformId: PROTOCRM_PLATFORM_ID,
      });
    }
  }

  return records;
}

/**
 * Backward-compatible normalization for provider records written before the
 * persisted credentialsVerified flag was introduced. The previous
 * credentialsVerifiedAt timestamp was already authoritative, so infer the new
 * flag once on load without requiring a destructive database migration.
 */
function normalizeLegacyExternalAuthProviders(
  records: Map<string, SysBOExtAuthProvider>,
): Map<string, SysBOExtAuthProvider> {
  for (const [id, provider] of records) {
    if (typeof provider.credentialsVerified !== 'boolean') {
      records.set(id, {
        ...provider,
        credentialsVerified: Boolean(
          provider.clientId?.trim() &&
          provider.clientSecretEncrypted &&
          provider.credentialsVerifiedAt,
        ),
      });
    }
  }

  return records;
}
