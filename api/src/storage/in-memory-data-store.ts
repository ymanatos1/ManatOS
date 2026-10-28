import { AsyncLocalStorage } from 'node:async_hooks';

import {
  sysBOApplicationsMetadata,
  sysBOGuardsMetadata,
  sysBOProjectsMetadata,
  sysBOPostsMetadata,
  sysBOConfigurationsMetadata,
  sysBOExtAuthProvidersMetadata,
  sysBOEmailAddressesMetadata,
  sysBOPrincipalEmailAddressesMetadata,
  sysBOTelephoneNumbersMetadata,
  sysBOPrincipalTelephoneNumbersMetadata,
  sysBOAddressesMetadata,
  sysBOPrincipalAddressesMetadata,
  sysBOLicensesMetadata,
  sysBOPrincipalsMetadata,
  sysBOUsersMetadata,
  type SysBOApplication,
  type SysBOGuard,
  type SysBOProject,
  type SysBOPost,
  type SysBOConfiguration,
  type SysBOExternalIdentity,
  type SysBOExtAuthProvider,
  type SysEmailAddress,
  type SysPrincipalEmailAddress,
  type SysTelephoneNumber,
  type SysPrincipalTelephoneNumber,
  type SysAddress,
  type SysPrincipalAddress,
  type SysBOLicense,
  type SysBOPrincipal,
  type SysBOUser,
  type SysBOUserInvitation,
  type SysBOPictureValue,
} from '@manatos/shared';
import { operationContext } from '@manatos/shared/node';

import { InMemoryRepository } from './in-memory-repository.js';

import { JsonFilePersistence } from './json-file-persistence.js';
import { PictureFileStorage } from './picture-file-storage.js';

import type { DatabaseState } from './types.js';

import type { StorageAdapter, StorageFlushResult } from './storage-adapter.js';
import { IN_MEMORY_JSON_ADAPTER_ID } from './adapters/in-memory-json/definition.js';
import { runStorageOperation } from './execution-context.js';
import { logExpiredTransaction } from '../logging/transaction-failure-log.js';
import { logTransactionFinalized } from '../logging/transaction-execution-log.js';
import {
  TransactionsSupport,
  type TransactionAction,
  type TransactionFinalizationResult,
} from './transactions-support.js';

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
  private readonly pictureStorage: PictureFileStorage;

  public sysUsers!: InMemoryRepository<SysBOUser>;

  public sysPrincipals!: InMemoryRepository<SysBOPrincipal>;

  public sysEmailAddresses!: InMemoryRepository<SysEmailAddress>;
  public sysPrincipalEmailAddresses!: InMemoryRepository<SysPrincipalEmailAddress>;
  public sysTelephoneNumbers!: InMemoryRepository<SysTelephoneNumber>;
  public sysPrincipalTelephoneNumbers!: InMemoryRepository<SysPrincipalTelephoneNumber>;
  public sysAddresses!: InMemoryRepository<SysAddress>;
  public sysPrincipalAddresses!: InMemoryRepository<SysPrincipalAddress>;

  public sysApplications!: InMemoryRepository<SysBOApplication>;
  public sysGuards!: InMemoryRepository<SysBOGuard>;
  public sysProjects!: InMemoryRepository<SysBOProject>;
  public sysPosts!: InMemoryRepository<SysBOPost>;

  public sysConfigurations!: InMemoryRepository<SysBOConfiguration>;

  public sysLicenses!: InMemoryRepository<SysBOLicense>;

  public sysExtAuthProviders!: InMemoryRepository<SysBOExtAuthProvider>;

  constructor(private readonly persistence: JsonFilePersistence) {
    this.pictureStorage = new PictureFileStorage(persistence.pictureRootDirectory());
    this.transactions = new TransactionsSupport({
      onFinalized: (result) => logTransactionFinalized(result),
      onExpired: (result) => {
        logExpiredTransaction(result);
      },
    });
  }

  async writePicture(
    entityKey: string,
    recordId: string,
    fieldKey: string,
    contentType: SysBOPictureValue['contentType'],
    bytes: Buffer,
    revision: string,
  ): Promise<void> {
    await this.pictureStorage.write(entityKey, recordId, fieldKey, contentType, bytes, revision);
  }

  readPicture(
    entityKey: string,
    recordId: string,
    fieldKey: string,
    picture: SysBOPictureValue,
  ): Promise<Buffer | null> {
    return this.pictureStorage.read(entityKey, recordId, fieldKey, picture);
  }

  deletePicture(
    entityKey: string,
    recordId: string,
    fieldKey: string,
    picture: SysBOPictureValue | null | undefined,
  ): Promise<void> {
    return this.pictureStorage.delete(entityKey, recordId, fieldKey, picture);
  }

  async writePictureItem(
    entityKey: string,
    recordId: string,
    fieldKey: string,
    pictureId: string,
    contentType: SysBOPictureValue['contentType'],
    bytes: Buffer,
    revision: string,
  ): Promise<void> {
    await this.pictureStorage.writeItem(
      entityKey,
      recordId,
      fieldKey,
      pictureId,
      contentType,
      bytes,
      revision,
    );
  }

  readPictureItem(
    entityKey: string,
    recordId: string,
    fieldKey: string,
    picture: SysBOPictureValue,
  ): Promise<Buffer | null> {
    return this.pictureStorage.readItem(entityKey, recordId, fieldKey, picture);
  }

  deletePictureItem(
    entityKey: string,
    recordId: string,
    fieldKey: string,
    picture: SysBOPictureValue,
  ): Promise<void> {
    return this.pictureStorage.deleteItem(entityKey, recordId, fieldKey, picture);
  }

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
  externalIdentities(): Map<string, SysBOExternalIdentity> {
    return this.state.sysExternalIdentities;
  }

  /**
   * SysBOUser <-> SysBOPrincipal relationships.
   */

  /**
   * User invitation records.
   */
  userInvitations(): Map<string, SysBOUserInvitation> {
    return this.state.sysUserInvitations;
  }

  /**
   * Resolve a persisted collection by canonical ManatOS metadata key.
   * Relationship/delete planning uses this instead of hard-coding one target
   * entity at a time. Future storage adapters can provide the equivalent
   * metadata-key lookup over real tables/repositories.
   */
  collectionForObjectKey(objectKey: string): Map<string, Record<string, unknown>> | null {
    const map = (() => {
      switch (objectKey) {
        case 'sys-users':
          return this.state.sysUsers;
        case 'sys-principals':
          return this.state.sysPrincipals;
        case 'sys-email-addresses':
          return this.state.sysEmailAddresses;
        case 'sys-principal-email-addresses':
          return this.state.sysPrincipalEmailAddresses;
        case 'sys-telephone-numbers':
          return this.state.sysTelephoneNumbers;
        case 'sys-principal-telephone-numbers':
          return this.state.sysPrincipalTelephoneNumbers;
        case 'sys-addresses':
          return this.state.sysAddresses;
        case 'sys-principal-addresses':
          return this.state.sysPrincipalAddresses;
        case 'sys-applications':
          return this.state.sysApplications;
        case 'sys-guards':
          return this.state.sysGuards;
        case 'sys-projects':
          return this.state.sysProjects;
        case 'sys-posts':
          return this.state.sysPosts;
        case 'sys-configurations':
          return this.state.sysConfigurations;
        case 'sys-licenses':
          return this.state.sysLicenses;
        case 'sys-ext-auth-providers':
          return this.state.sysExtAuthProviders;
        case 'external-identities':
          return this.state.sysExternalIdentities;
        case 'user-invitations':
          return this.state.sysUserInvitations;
        default:
          return null;
      }
    })();

    return map as unknown as Map<string, Record<string, unknown>> | null;
  }

  private readonly transactionScope = new AsyncLocalStorage<boolean>();

  private readonly explicitTransactionScope = new AsyncLocalStorage<{
    transactionId: string;
    ownerId: string;
  }>();

  private readonly transactions: TransactionsSupport;

  async beginTransaction(ownerId: string): Promise<string> {
    return this.transactions.begin(ownerId);
  }

  commitTransaction(
    transactionId: string,
    ownerId: string,
  ): Promise<TransactionFinalizationResult> {
    return this.transactions.commit(transactionId, ownerId);
  }

  rollbackTransaction(
    transactionId: string,
    ownerId: string,
  ): Promise<TransactionFinalizationResult> {
    return this.transactions.rollback(transactionId, ownerId);
  }

  acquireExplicitTransactionOperation(transactionId: string, ownerId: string): void {
    this.transactions.acquireOperation(transactionId, ownerId);
  }

  releaseExplicitTransactionOperation(transactionId: string, ownerId: string): void {
    this.transactions.releaseOperation(transactionId, ownerId);
  }

  runInExplicitTransaction<T>(transactionId: string, ownerId: string, operation: () => T): T {
    this.transactions.assertOwned(transactionId, ownerId);
    return this.explicitTransactionScope.run({ transactionId, ownerId }, operation);
  }

  hasExplicitTransaction(): boolean {
    return Boolean(this.explicitTransactionScope.getStore());
  }

  registerExplicitTransactionActions(
    description: string,
    actions: { commit?: TransactionAction[]; rollback?: TransactionAction[] },
  ): void {
    const context = this.explicitTransactionScope.getStore();
    if (!context) return;
    this.transactions.register(context.transactionId, context.ownerId, actions, description);
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
    // Nested service operations participate in the outer transaction. Only the
    // outermost boundary snapshots/saves/rolls back the complete datastore.
    if (this.transactionScope.getStore()) return operation();

    return runStorageOperation(IN_MEMORY_JSON_ADAPTER_ID, 'transaction', () =>
      operationContext.run('Execute datastore transaction', () =>
        this.transactionScope.run(true, async () => {
          const snapshot = structuredClone(this.state);
          const explicit = this.explicitTransactionScope.getStore();

          let persistenceAttempted = false;
          try {
            const result = await operation();

            persistenceAttempted = true;
            await this.persistence.save(this.state);

            if (explicit) {
              this.transactions.register(
                explicit.transactionId,
                explicit.ownerId,
                {
                  rollback: [
                    {
                      description: 'Restore datastore snapshot',
                      execute: async () => {
                        this.restoreState(snapshot);
                        await this.persistence.save(this.state);
                      },
                    },
                  ],
                },
                'Persist datastore operation',
              );
            }

            return result;
          } catch (error) {
            /**
             * IMPORTANT:
             *
             * Do not replace `this.state` or rebuild repository wrapper objects here.
             * Long-lived domain services keep references to the repositories created
             * during application startup. Replacing those wrappers after a rollback
             * leaves the services pointing at detached Maps and can make an existing
             * SysBOUser appear to disappear in a later request.
             *
             * Restore every collection IN PLACE instead. This preserves the identity
             * of both the DatabaseState Maps and the repository wrappers while still
             * returning the datastore to its pre-transaction contents.
             */
            this.restoreState(snapshot);

            if (explicit && persistenceAttempted) {
              // The durable JSON write itself failed. Its exact on-disk outcome may
              // be uncertain, so enlist a rollback persistence attempt even though
              // this business step did not complete successfully. The outer Entry
              // transaction will report a second persistence failure as a rollback
              // failure while preserving the original write error as primary.
              this.transactions.register(
                explicit.transactionId,
                explicit.ownerId,
                {
                  rollback: [
                    {
                      description: 'Re-persist restored datastore after failed JSON write',
                      execute: () => this.persistence.save(this.state),
                    },
                  ],
                },
                'Recover failed datastore persistence',
              );
            }

            throw error;
          }
        }),
      ),
    );
  }

  private restoreState(snapshot: DatabaseState): void {
    restoreMap(this.state.sysUsers, snapshot.sysUsers);
    restoreMap(this.state.sysPrincipals, snapshot.sysPrincipals);
    restoreMap(this.state.sysEmailAddresses, snapshot.sysEmailAddresses);
    restoreMap(this.state.sysPrincipalEmailAddresses, snapshot.sysPrincipalEmailAddresses);
    restoreMap(this.state.sysTelephoneNumbers, snapshot.sysTelephoneNumbers);
    restoreMap(this.state.sysPrincipalTelephoneNumbers, snapshot.sysPrincipalTelephoneNumbers);
    restoreMap(this.state.sysAddresses, snapshot.sysAddresses);
    restoreMap(this.state.sysPrincipalAddresses, snapshot.sysPrincipalAddresses);
    restoreMap(this.state.sysApplications, snapshot.sysApplications);
    restoreMap(this.state.sysGuards, snapshot.sysGuards);
    restoreMap(this.state.sysProjects, snapshot.sysProjects);
    restoreMap(this.state.sysPosts, snapshot.sysPosts);
    restoreMap(this.state.sysConfigurations, snapshot.sysConfigurations);
    restoreMap(this.state.sysLicenses, snapshot.sysLicenses);
    restoreMap(this.state.sysExtAuthProviders, snapshot.sysExtAuthProviders);
    restoreMap(this.state.sysExternalIdentities, snapshot.sysExternalIdentities);
    restoreMap(this.state.sysUserInvitations, snapshot.sysUserInvitations);
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
    this.sysUsers = new InMemoryRepository(this.state.sysUsers, sysBOUsersMetadata);

    this.sysPrincipals = new InMemoryRepository(this.state.sysPrincipals, sysBOPrincipalsMetadata);
    this.sysEmailAddresses = new InMemoryRepository(
      this.state.sysEmailAddresses,
      sysBOEmailAddressesMetadata,
    );
    this.sysPrincipalEmailAddresses = new InMemoryRepository(
      this.state.sysPrincipalEmailAddresses,
      sysBOPrincipalEmailAddressesMetadata,
    );
    this.sysTelephoneNumbers = new InMemoryRepository(
      this.state.sysTelephoneNumbers,
      sysBOTelephoneNumbersMetadata,
    );
    this.sysPrincipalTelephoneNumbers = new InMemoryRepository(
      this.state.sysPrincipalTelephoneNumbers,
      sysBOPrincipalTelephoneNumbersMetadata,
    );
    this.sysAddresses = new InMemoryRepository(this.state.sysAddresses, sysBOAddressesMetadata);
    this.sysPrincipalAddresses = new InMemoryRepository(
      this.state.sysPrincipalAddresses,
      sysBOPrincipalAddressesMetadata,
    );

    this.sysApplications = new InMemoryRepository(
      this.state.sysApplications,
      sysBOApplicationsMetadata,
    );
    this.sysGuards = new InMemoryRepository(this.state.sysGuards, sysBOGuardsMetadata);
    this.sysProjects = new InMemoryRepository(this.state.sysProjects, sysBOProjectsMetadata);
    this.sysPosts = new InMemoryRepository(this.state.sysPosts, sysBOPostsMetadata);

    this.sysConfigurations = new InMemoryRepository(
      this.state.sysConfigurations,
      sysBOConfigurationsMetadata,
    );

    this.sysLicenses = new InMemoryRepository(this.state.sysLicenses, sysBOLicensesMetadata);

    this.sysExtAuthProviders = new InMemoryRepository(
      this.state.sysExtAuthProviders,
      sysBOExtAuthProvidersMetadata,
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
