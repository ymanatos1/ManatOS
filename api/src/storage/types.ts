import type {
  SysBOApplication,
  SysBOConfiguration,
  SysBOExternalIdentity,
  SysBOExtAuthProvider,
  SysBOLicense,
  SysBOPrincipal,
  SysBOUser,
  SysBOUserInvitation,
  SysBOUserPrincipal,
} from '@manatos/shared';

/**
 * Runtime representation of the complete in-memory database.
 *
 * Every business-object collection is keyed by the entity GUID.
 */
export interface DatabaseState {
  sysUsers: Map<string, SysBOUser>;

  sysPrincipals: Map<string, SysBOPrincipal>;

  sysApplications: Map<string, SysBOApplication>;

  sysConfigurations: Map<string, SysBOConfiguration>;

  sysLicenses: Map<string, SysBOLicense>;

  sysExtAuthProviders: Map<string, SysBOExtAuthProvider>;

  sysExternalIdentities: Map<string, SysBOExternalIdentity>;

  sysUserPrincipals: Map<string, SysBOUserPrincipal>;

  sysUserInvitations: Map<string, SysBOUserInvitation>;
}

/**
 * JSON-serializable representation of an entity whose ID is stored
 * exclusively as the containing JSON object's property name.
 *
 * The runtime entity ID is reconstructed from that property name
 * when the JSON database is loaded.
 */
export type PersistedEntity<T extends { id: string }> = Omit<T, 'id'>;

/**
 * JSON-serializable representation of DatabaseState.
 *
 * Runtime Maps are persisted as JSON objects keyed by entity GUID.
 *
 * The GUID exists only once in the JSON representation:
 *
 * {
 *   "entity-guid": {
 *     ...entity fields except id
 *   }
 * }
 *
 * On load, the JSON property name is restored as entity.id.
 */
export interface PersistedDatabaseState {
  sysUsers: Record<string, PersistedEntity<SysBOUser>>;

  sysPrincipals: Record<string, PersistedEntity<SysBOPrincipal>>;

  sysApplications: Record<string, PersistedEntity<SysBOApplication>>;

  sysConfigurations: Record<string, PersistedEntity<SysBOConfiguration>>;

  sysLicenses: Record<string, PersistedEntity<SysBOLicense>>;

  sysExtAuthProviders: Record<string, PersistedEntity<SysBOExtAuthProvider>>;

  sysExternalIdentities: Record<string, PersistedEntity<SysBOExternalIdentity>>;

  sysUserPrincipals: Record<string, PersistedEntity<SysBOUserPrincipal>>;

  sysUserInvitations: Record<string, PersistedEntity<SysBOUserInvitation>>;
}

/**
 * Create a new completely empty in-memory database.
 */
export const emptyDatabaseState = (): DatabaseState => ({
  sysUsers: new Map(),

  sysPrincipals: new Map(),

  sysApplications: new Map(),

  sysConfigurations: new Map(),

  sysLicenses: new Map(),

  sysExtAuthProviders: new Map(),

  sysExternalIdentities: new Map(),

  sysUserPrincipals: new Map(),

  sysUserInvitations: new Map(),
});
