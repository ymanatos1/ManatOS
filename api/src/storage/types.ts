import type {
  SysApplication,
  SysExternalIdentity,
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

  sysLicenses: Map<string, SysLicense>;

  sysExternalIdentities: Map<string, SysExternalIdentity>;

  sysUserPrincipals: Map<string, SysUserPrincipal>;

  sysUserInvitations: Map<string, SysUserInvitation>;
}

/**
 * JSON-serializable representation of DatabaseState.
 *
 * Maps are converted into objects before persistence because native
 * JavaScript Map instances are not directly represented by JSON.
 */
export interface PersistedDatabaseState {
  sysUsers: Record<string, SysUser>;

  sysPrincipals: Record<string, SysPrincipal>;

  sysApplications: Record<string, SysApplication>;

  sysLicenses: Record<string, SysLicense>;

  sysExternalIdentities: Record<string, SysExternalIdentity>;

  sysUserPrincipals: Record<string, SysUserPrincipal>;

  sysUserInvitations: Record<string, SysUserInvitation>;
}

/**
 * Create a new completely empty in-memory database.
 */
export const emptyDatabaseState = (): DatabaseState => ({
  sysUsers: new Map(),

  sysPrincipals: new Map(),

  sysApplications: new Map(),

  sysLicenses: new Map(),

  sysExternalIdentities: new Map(),

  sysUserPrincipals: new Map(),

  sysUserInvitations: new Map(),
});
