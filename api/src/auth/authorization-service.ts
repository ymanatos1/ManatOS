import {
  ForbiddenAppError,
  MCRM_PLATFORM_ID,
  SysLicenseStatus,
  SysUserRole,
  type SysApplication,
  type SysBOEntity,
  type SysLicense,
} from '@manatos/shared';

import type { InMemoryDataStore } from '../storage/in-memory-data-store.js';

/**
 * Transport-neutral authenticated subject.
 *
 * AccessTokenContext already has this shape, so it can be passed
 * directly without making AuthorizationService depend on Express.
 */
export interface AuthorizationSubject {
  userId: string;
  userName: string;
  role: SysUserRole;
}

export type SysBOAuthorizationAction = 'read' | 'create' | 'update' | 'delete';

/**
 * Context provided to application-specific permission logic.
 *
 * This is deliberately separate from the generic authorization service.
 * SysApplication permissions are expected to become considerably richer
 * later.
 */
export interface SysApplicationPermissionContext {
  action: 'update' | 'delete';

  subject: AuthorizationSubject;

  application: SysApplication;

  relatedLicenses: SysLicense[];
}

/**
 * Extension point for future SysApplication permission logic.
 */
export interface SysApplicationPermissionPolicy {
  canModifyDefinition(context: SysApplicationPermissionContext): Promise<boolean>;
}

/**
 * Baseline application permission policy.
 *
 * For now, an active license establishes permission to modify an
 * application's definition.
 *
 * Later this class can additionally evaluate:
 *
 * - license capabilities;
 * - permission sets;
 * - owner/admin/member roles;
 * - application-specific ACLs;
 * - read/write/delete capabilities;
 * - subscription tier;
 * - feature flags.
 */
export class DefaultSysApplicationPermissionPolicy implements SysApplicationPermissionPolicy {
  async canModifyDefinition(context: SysApplicationPermissionContext): Promise<boolean> {
    return context.relatedLicenses.some(
      (license) => license.enabled && license.status === SysLicenseStatus.Active,
    );
  }
}

/**
 * Central authorization service for SysBO access.
 *
 * Read:
 *   Every authenticated Guest/User/Superuser/Admin may read every current SysBO.
 *
 * Create:
 *   Generic creation is Admin-only.
 *
 * Update/Delete:
 *   Admin may modify everything.
 *   Guest/User/Superuser may modify only related records.
 */
export class AuthorizationService {
  constructor(
    private readonly store: InMemoryDataStore,

    private readonly applicationPermissions: SysApplicationPermissionPolicy = new DefaultSysApplicationPermissionPolicy(),
  ) {}

  async assertCan(
    action: SysBOAuthorizationAction,
    subject: AuthorizationSubject,
    sysBOKey: string,
    record?: SysBOEntity,
  ): Promise<void> {
    const allowed = await this.can(action, subject, sysBOKey, record);

    if (!allowed) {
      throw new ForbiddenAppError(
        `${subject.userName} is not authorized to ${action} ${sysBOKey}.`,
      );
    }
  }

  async can(
    action: SysBOAuthorizationAction,
    subject: AuthorizationSubject,
    sysBOKey: string,
    record?: SysBOEntity,
  ): Promise<boolean> {
    /**
     * SysUser deletion is intentionally stricter than the generic
     * relationship-based authorization rules:
     *
     * - only Administrators may delete SysUsers;
     * - an Administrator may never delete their own SysUser record.
     */
    if (action === 'delete' && sysBOKey === 'sys-users') {
      return subject.role === SysUserRole.Admin && record !== undefined && record.id !== subject.userId;
    }

    /**
     * Administrators may perform every other action.
     */
    if (subject.role === SysUserRole.Admin) {
      return true;
    }

    /**
     * Every authenticated Guest/User/Superuser can read all current SysBOs.
     */
    if (action === 'read') {
      return true;
    }

    /**
     * Generic creation remains administrator-only.
     *
     * Public Guest registration is a separate controlled workflow and
     * therefore does not use generic SysUser creation authorization.
     */
    if (action === 'create') {
      return false;
    }

    if (!record) {
      return false;
    }

    /**
     * Audit relationship applies to every SysBO.
     *
     * A record created or last updated by the current user is considered
     * related to that user.
     */
    if (this.auditRelatesUser(subject, record)) {
      return true;
    }

    switch (sysBOKey) {
      case 'sys-users':
        return record.id === subject.userId;

      case 'sys-principals':
        return this.userRelatesToPrincipal(subject.userId, record.id);

      case 'sys-licenses':
        return this.userRelatesToLicense(subject.userId, record as SysLicense);

      case 'sys-applications':
        return this.userMayModifyApplication(action, subject, record as SysApplication);

      default:
        /*
         * Unknown/future SysBOs fall back to the generic audit
         * relationship rule already evaluated above.
         */
        return false;
    }
  }

  /**
   * CreatedBy / UpdatedBy are part of the relationship model requested
   * for Guest/User modification rights.
   */
  private auditRelatesUser(subject: AuthorizationSubject, record: SysBOEntity): boolean {
    const userName = normalize(subject.userName);

    return normalize(record.createdBy) === userName || normalize(record.updatedBy) === userName;
  }

  /**
   * Determine whether a website user is linked to a customer principal.
   */
  private userRelatesToPrincipal(userId: string, principalId: string): boolean {
    for (const link of this.store.userPrincipals().values()) {
      if (link.enabled && link.userId === userId && link.principalId === principalId) {
        return true;
      }
    }

    return false;
  }

  /**
   * A license is related to the user when its owning principal is
   * related to that user.
   */
  private userRelatesToLicense(userId: string, license: SysLicense): boolean {
    return this.userRelatesToPrincipal(userId, license.principalId);
  }

  /**
   * A SysApplication becomes related through a license owned by one
   * of the user's related principals.
   *
   * The actual ability to alter the application definition is then
   * delegated to the SysApplication permission policy.
   */
  private async userMayModifyApplication(
    action: SysBOAuthorizationAction,
    subject: AuthorizationSubject,
    application: SysApplication,
  ): Promise<boolean> {
    if (action !== 'update' && action !== 'delete') {
      return false;
    }

    const relatedLicenses = this.findUserApplicationLicenses(subject.userId, application.id);

    if (relatedLicenses.length === 0) {
      return false;
    }

    return this.applicationPermissions.canModifyDefinition({
      action,
      subject,
      application,
      relatedLicenses,
    });
  }

  private findUserApplicationLicenses(userId: string, applicationId: string): SysLicense[] {
    const result: SysLicense[] = [];

    for (const license of this.store.sysLicenses.values()) {
      if (license.platformId !== MCRM_PLATFORM_ID) {
        continue;
      }

      // A platform-wide mCRM license (no applicationId) relates to every
      // SysApplication. A restricted legacy/current license relates only to
      // its named application.
      if (license.applicationId && license.applicationId !== applicationId) {
        continue;
      }

      if (this.userRelatesToPrincipal(userId, license.principalId)) {
        result.push(license);
      }
    }

    return result;
  }
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}
