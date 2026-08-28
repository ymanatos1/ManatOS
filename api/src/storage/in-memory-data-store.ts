import {
  sysApplicationsMetadata,
  sysConfigurationsMetadata,
  sysExtAuthProvidersMetadata,
  sysLicensesMetadata,
  sysPrincipalsMetadata,
  sysUsersMetadata,
  type SysApplication,
  type SysConfiguration,
  type SysExternalIdentity,
  type SysExtAuthProvider,
  type SysLicense,
  type SysPrincipal,
  type SysUser,
  type SysUserInvitation,
  type SysUserPrincipal,
} from '@manatos/shared';

import { InMemoryRepository } from './in-memory-repository.js';

import { JsonFilePersistence } from './json-file-persistence.js';

import type { DatabaseState } from './types.js';

import type { StorageAdapter, StorageFlushResult } from './storage-adapter.js';

/**
 * Replaceable data-store adapter.
 *
 * Business services never need to know that this implementation
 * currently persists its data into a JSON file.
 *
 * A future SQL Server/PostgreSQL/etc. implementation should expose
 * equivalent storage behavior behind another adapter.
 */
export class InMemoryDataStore implements StorageAdapter {
  private state!: DatabaseState;

  public sysUsers!: InMemoryRepository<SysUser>;

  public sysPrincipals!: InMemoryRepository<SysPrincipal>;

  public sysApplications!: InMemoryRepository<SysApplication>;

  public sysConfigurations!: InMemoryRepository<SysConfiguration>;

  public sysLicenses!: InMemoryRepository<SysLicense>;

  public sysExtAuthProviders!: InMemoryRepository<SysExtAuthProvider>;

  constructor(private readonly persistence: JsonFilePersistence) {}

  /**
   * Load persisted data and build repositories over the resulting
   * in-memory collections.
   */
  async initialize(): Promise<void> {
    this.state = await this.persistence.load();

    this.rebuild();
  }

  /**
   * External authentication identities.
   *
   * These currently use their Map directly rather than the generic
   * SysBO repository abstraction.
   */
  externalIdentities(): Map<string, SysExternalIdentity> {
    return this.state.sysExternalIdentities;
  }

  /**
   * SysUser <-> SysPrincipal relationships.
   */
  userPrincipals(): Map<string, SysUserPrincipal> {
    return this.state.sysUserPrincipals;
  }

  /**
   * User invitation records.
   */
  userInvitations(): Map<string, SysUserInvitation> {
    return this.state.sysUserInvitations;
  }

  /**
   * Execute a mutating operation using lightweight transaction-like
   * semantics.
   *
   * Before the operation begins, the complete in-memory state is cloned.
   *
   * Success:
   *   Persist the resulting state.
   *
   * Failure:
   *   Restore the snapshot and rebuild the repositories.
   *
   * This is intentionally a demonstration implementation rather than
   * a replacement for real database transactions.
   */
  async executeTransaction<T>(operation: () => Promise<T>): Promise<T> {
    const snapshot = structuredClone(this.state);

    try {
      const result = await operation();

      await this.persistence.save(this.state);

      return result;
    } catch (error) {
      /**
       * IMPORTANT:
       *
       * Do not replace `this.state` or rebuild repository wrapper objects here.
       * Long-lived domain services keep references to the repositories created
       * during application startup. Replacing those wrappers after a rollback
       * leaves the services pointing at detached Maps and can make an existing
       * SysUser appear to disappear in a later request.
       *
       * Restore every collection IN PLACE instead. This preserves the identity
       * of both the DatabaseState Maps and the repository wrappers while still
       * returning the datastore to its pre-transaction contents.
       */
      restoreMap(this.state.sysUsers, snapshot.sysUsers);
      restoreMap(this.state.sysPrincipals, snapshot.sysPrincipals);
      restoreMap(this.state.sysApplications, snapshot.sysApplications);
      restoreMap(this.state.sysConfigurations, snapshot.sysConfigurations);
      restoreMap(this.state.sysLicenses, snapshot.sysLicenses);
      restoreMap(this.state.sysExtAuthProviders, snapshot.sysExtAuthProviders);
      restoreMap(this.state.sysExternalIdentities, snapshot.sysExternalIdentities);
      restoreMap(this.state.sysUserPrincipals, snapshot.sysUserPrincipals);
      restoreMap(this.state.sysUserInvitations, snapshot.sysUserInvitations);

      throw error;
    }
  }

  /**
   * Explicitly persist the current state.
   */
  async save(): Promise<void> {
    await this.persistence.save(this.state);
  }

  /**
   * Explicitly flush the current in-memory database into its configured
   * persistent backing store.
   *
   * For this adapter that means writing the complete current state into
   * data/database.json through JsonFilePersistence.
   *
   * Future database adapters can implement this differently. A normal SQL
   * adapter, for example, may report that no explicit flush is required
   * because each committed transaction is already durable.
   */
  async flush(): Promise<StorageFlushResult> {
    await this.persistence.save(this.state);

    return {
      provider: 'InMemory',
      persistence: 'JSON',
      flushed: true,
      timestamp: new Date().toISOString(),
      details: 'Current in-memory database state was persisted successfully.',
    };
  }

  /**
   * Lightweight datastore health check.
   *
   * It intentionally performs no write operation.
   */
  healthCheck() {
    if (!this.state) {
      return {
        status: 'error' as const,

        provider: 'InMemory',

        persistence: 'JSON',
      };
    }

    return {
      status: 'ok' as const,

      provider: 'InMemory',

      persistence: 'JSON',
    };
  }

  /**
   * Recreate generic repositories over the current state.
   *
   * This is required after initialization. Transaction rollback deliberately
   * restores collections in place so long-lived services never lose their
   * repository references.
   */
  private rebuild(): void {
    this.sysUsers = new InMemoryRepository(this.state.sysUsers, sysUsersMetadata);

    this.sysPrincipals = new InMemoryRepository(this.state.sysPrincipals, sysPrincipalsMetadata);

    this.sysApplications = new InMemoryRepository(
      this.state.sysApplications,
      sysApplicationsMetadata,
    );

    this.sysConfigurations = new InMemoryRepository(this.state.sysConfigurations, sysConfigurationsMetadata);

    this.sysLicenses = new InMemoryRepository(this.state.sysLicenses, sysLicensesMetadata);

    this.sysExtAuthProviders = new InMemoryRepository(
      this.state.sysExtAuthProviders,
      sysExtAuthProvidersMetadata,
    );
  }
}


/**
 * Restore a Map to a previously cloned snapshot without changing the Map
 * object's identity. Repository wrappers and domain services may safely keep
 * references to the target Map across failed transactions.
 */
function restoreMap<K, V>(target: Map<K, V>, snapshot: Map<K, V>): void {
  target.clear();

  for (const [key, value] of snapshot) {
    target.set(key, value);
  }
}
