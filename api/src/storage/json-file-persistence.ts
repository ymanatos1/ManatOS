import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

import { dirname, resolve } from 'node:path';

import { MCRM_PLATFORM_ID, StorageAppError, type SysLicense } from '@manatos/shared';

import { emptyDatabaseState, type DatabaseState, type PersistedDatabaseState } from './types.js';

/**
 * JSON persistence used only by the in-memory storage adapter.
 */
export class JsonFilePersistence {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = resolve(process.cwd(), filePath);
  }

  /**
   * Load the persisted database from disk.
   *
   * If the file does not exist yet, return a completely empty
   * database state rather than treating that as an error.
   */
  async load(): Promise<DatabaseState> {
    try {
      const raw = JSON.parse(await readFile(this.filePath, 'utf8')) as PersistedDatabaseState;

      return {
        sysUsers: fromPersistedRecords(raw.sysUsers),

        sysPrincipals: fromPersistedRecords(raw.sysPrincipals),

        sysApplications: fromPersistedRecords(raw.sysApplications),

        sysLicenses: normalizeLegacyLicenses(fromPersistedRecords(raw.sysLicenses)),

        sysExternalIdentities: fromPersistedRecords(raw.sysExternalIdentities),

        sysUserPrincipals: fromPersistedRecords(raw.sysUserPrincipals),

        sysUserInvitations: fromPersistedRecords(raw.sysUserInvitations),
      };
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
  }

  /**
   * Persist the complete current in-memory state.
   *
   * Data is first written to a temporary file and then renamed over
   * the actual database file. This reduces the chance of leaving a
   * partially written JSON database behind.
   */
  async save(state: DatabaseState): Promise<void> {
    const persisted: PersistedDatabaseState = {
      sysUsers: toPersistedRecords(state.sysUsers),

      sysPrincipals: toPersistedRecords(state.sysPrincipals),

      sysApplications: toPersistedRecords(state.sysApplications),

      sysLicenses: toPersistedRecords(state.sysLicenses),

      sysExternalIdentities: toPersistedRecords(state.sysExternalIdentities),

      sysUserPrincipals: toPersistedRecords(state.sysUserPrincipals),

      sysUserInvitations: toPersistedRecords(state.sysUserInvitations),
    };

    const temporaryFilePath = `${this.filePath}.tmp`;

    try {
      await mkdir(dirname(this.filePath), {
        recursive: true,
      });

      await writeFile(
        temporaryFilePath,

        JSON.stringify(persisted, null, 2) + '\n',

        'utf8',
      );

      await rename(temporaryFilePath, this.filePath);
    } catch (error) {
      throw new StorageAppError(`Failed to persist '${this.filePath}'.`, error);
    }
  }
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
 * Backward-compatible normalization for databases written before platform
 * ownership was introduced. Existing licenses necessarily referred to mCRM
 * SysApplications, so the migration is deterministic and does not require a
 * destructive database rebuild.
 */
function normalizeLegacyLicenses(records: Map<string, SysLicense>): Map<string, SysLicense> {
  for (const [id, license] of records) {
    if (!license.platformId) {
      records.set(id, {
        ...license,
        platformId: MCRM_PLATFORM_ID,
      });
    }
  }

  return records;
}
