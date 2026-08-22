import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

import { dirname, resolve } from 'node:path';

import { StorageAppError } from '@manatos/shared';

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
        sysUsers: new Map(Object.entries(raw.sysUsers ?? {})),

        sysPrincipals: new Map(Object.entries(raw.sysPrincipals ?? {})),

        sysApplications: new Map(Object.entries(raw.sysApplications ?? {})),

        sysLicenses: new Map(Object.entries(raw.sysLicenses ?? {})),

        sysExternalIdentities: new Map(Object.entries(raw.sysExternalIdentities ?? {})),

        sysUserPrincipals: new Map(Object.entries(raw.sysUserPrincipals ?? {})),

        sysUserInvitations: new Map(Object.entries(raw.sysUserInvitations ?? {})),
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
      sysUsers: Object.fromEntries(state.sysUsers),

      sysPrincipals: Object.fromEntries(state.sysPrincipals),

      sysApplications: Object.fromEntries(state.sysApplications),

      sysLicenses: Object.fromEntries(state.sysLicenses),

      sysExternalIdentities: Object.fromEntries(state.sysExternalIdentities),

      sysUserPrincipals: Object.fromEntries(state.sysUserPrincipals),

      sysUserInvitations: Object.fromEntries(state.sysUserInvitations),
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
 * Type guard for Node.js filesystem errors.
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
