import type {
  SysApplication,
  SysConfiguration,
  SysExternalIdentity,
  SysExtAuthProvider,
  SysLicense,
  SysPrincipal,
  SysUser,
  SysUserInvitation,
  SysUserPrincipal,
} from '@manatos/shared';

/**
 * Runtime representation of the complete in-memory database.
 *
 * Every business-object collection is keyed by the entity GUID.
 */
export interface DatabaseState {
  sysUsers: Map<string, SysUser>;

  sysPrincipals: Map<string, SysPrincipal>;

  sysApplications: Map<string, SysApplication>;

  sysConfigurations: Map<string, SysConfiguration>;

  sysLicenses: Map<string, SysLicense>;

  sysExtAuthProviders: Map<string, SysExtAuthProvider>;

  sysExternalIdentities: Map<string, SysExternalIdentity>;

  sysUserPrincipals: Map<string, SysUserPrincipal>;

  sysUserInvitations: Map<string, SysUserInvitation>;
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
  sysUsers: Record<string, PersistedEntity<SysUser>>;

  sysPrincipals: Record<string, PersistedEntity<SysPrincipal>>;

  sysApplications: Record<string, PersistedEntity<SysApplication>>;

  sysConfigurations: Record<string, PersistedEntity<SysConfiguration>>;

  sysLicenses: Record<string, PersistedEntity<SysLicense>>;

  sysExtAuthProviders: Record<string, PersistedEntity<SysExtAuthProvider>>;

  sysExternalIdentities: Record<string, PersistedEntity<SysExternalIdentity>>;

  sysUserPrincipals: Record<string, PersistedEntity<SysUserPrincipal>>;

  sysUserInvitations: Record<string, PersistedEntity<SysUserInvitation>>;
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
