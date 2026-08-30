import {
  ForbiddenAppError,
  MCRM_PLATFORM_ID,
  licenseGrantsApplicationAccess,
  licenseGrantsPlatformAccess,
  SysBOLicenseStatus,
  SysBOUserRole,
  type SysBOApplication,
  type SysBOEntity,
  type SysBOLicense,
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
  role: SysBOUserRole;
}

export type SysBOAuthorizationAction = 'read' | 'create' | 'update' | 'delete';

/**
 * Context provided to application-specific permission logic.
 *
 * This is deliberately separate from the generic authorization service.
 * SysBOApplication permissions are expected to become considerably richer
 * later.
 */
export interface SysBOApplicationPermissionContext {
  action: 'update' | 'delete';

  subject: AuthorizationSubject;

  application: SysBOApplication;

  relatedLicenses: SysBOLicense[];
}

/**
 * Extension point for future SysBOApplication permission logic.
 */
export interface SysBOApplicationPermissionPolicy {
  canModifyDefinition(context: SysBOApplicationPermissionContext): Promise<boolean>;
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
export class DefaultSysBOApplicationPermissionPolicy implements SysBOApplicationPermissionPolicy {
  async canModifyDefinition(context: SysBOApplicationPermissionContext): Promise<boolean> {
    return context.relatedLicenses.some(
      (license) => license.enabled && license.status === SysBOLicenseStatus.Active,
    );
  }
}

/**
 * Central authorization service for SysBO access.
 *
 * Read:
 *   Company-owned entities follow their record rules; mCRM applications are
 *   entitlement-scoped for every non-Admin user.
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

    private readonly applicationPermissions: SysBOApplicationPermissionPolicy = new DefaultSysBOApplicationPermissionPolicy(),
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
    /** External authentication configuration contains security-sensitive settings. */
    if (sysBOKey === 'sys-ext-auth-providers') {
      return subject.role === SysBOUserRole.Admin;
    }

    /**
     * SysBOUser deletion is intentionally stricter than the generic
     * relationship-based authorization rules:
     *
     * - only Administrators may delete SysBOUsers;
     * - an Administrator may never delete their own SysBOUser record.
     */
    if (action === 'delete' && sysBOKey === 'sys-users') {
      return subject.role === SysBOUserRole.Admin && record !== undefined && record.id !== subject.userId;
    }

    /**
     * Administrators may perform every other action.
     */
    if (subject.role === SysBOUserRole.Admin) {
      return true;
    }

    /**
     * SysBOUser reads are record-scoped for every non-Admin role.
     *
     * A collection-level read has no record yet, so it is allowed to reach
     * the list pipeline. The current in-memory adapter then calls
     * filterListItems() before client filtering/sorting/paging. A direct
     * record read succeeds only for the authenticated user's own SysBOUser.
     */
    if (action === 'read' && sysBOKey === 'sys-users') {
      return record === undefined || record.id === subject.userId;
    }

    /**
     * mCRM application visibility is license scoped for every non-Admin user.
     * A collection read is allowed only when the user owns at least one current
     * mCRM entitlement through a linked principal. Individual application reads
     * additionally honor an applicationId restriction when the license has one.
     */
    if (action === 'read' && sysBOKey === 'sys-applications') {
      return record === undefined
        ? this.userHasPlatformAccess(subject.userId, MCRM_PLATFORM_ID)
        : this.userMayReadApplication(subject.userId, record as SysBOApplication);
    }

    /**
     * Non-Admin users may inspect only licenses belonging to principals linked
     * to them. The collection itself remains queryable so an unlicensed user
     * receives an empty own-license list, which the UI uses to derive navigation
     * entitlement without exposing somebody else's licenses.
     */
    if (action === 'read' && sysBOKey === 'sys-licenses') {
      return record === undefined || this.userRelatesToLicense(subject.userId, record as SysBOLicense);
    }

    /** Other Company-owned SysBO reads retain the current baseline rule. */
    if (action === 'read') {
      return true;
    }

    /**
     * Generic creation remains administrator-only.
     *
     * Public Guest registration is a separate controlled workflow and
     * therefore does not use generic SysBOUser creation authorization.
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
        return this.userRelatesToLicense(subject.userId, record as SysBOLicense);

      case 'sys-applications':
        return this.userMayModifyApplication(action, subject, record as SysBOApplication);

      default:
        /*
         * Unknown/future SysBOs fall back to the generic audit
         * relationship rule already evaluated above.
         */
        return false;
    }
  }

  /**
   * Filter materialized rows through the same record-level read permission
   * used by direct GET /:id authorization.
   *
   * This is intentionally an in-memory implementation detail for now: it lets
   * the current Map-backed repository remove unauthorized rows before client
   * filters and pagination. A future RDBMS adapter should translate equivalent
   * role/record policy into its SQL WHERE predicate instead of materializing
   * rows and calling this method.
   */
  async filterListItems<T extends SysBOEntity>(
    subject: AuthorizationSubject,
    sysBOKey: string,
    items: readonly T[],
  ): Promise<T[]> {
    if (subject.role === SysBOUserRole.Admin) {
      return [...items];
    }

    const visible: T[] = [];

    for (const item of items) {
      if (await this.can('read', subject, sysBOKey, item)) {
        visible.push(item);
      }
    }

    return visible;
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
  private userRelatesToLicense(userId: string, license: SysBOLicense): boolean {
    return this.userRelatesToPrincipal(userId, license.principalId);
  }

  /** True when the user has any currently effective entitlement to a platform. */
  private userHasPlatformAccess(userId: string, platformId: string): boolean {
    for (const license of this.store.sysLicenses.values()) {
      if (!licenseGrantsPlatformAccess(license, platformId)) continue;
      if (this.userRelatesToPrincipal(userId, license.principalId)) return true;
    }

    return false;
  }

  /** True when a current license grants this user read access to one application. */
  private userMayReadApplication(userId: string, application: SysBOApplication): boolean {
    return this.findUserApplicationLicenses(userId, application.id).length > 0;
  }

  /**
   * A SysBOApplication becomes related through a license owned by one
   * of the user's related principals.
   *
   * The actual ability to alter the application definition is then
   * delegated to the SysBOApplication permission policy.
   */
  private async userMayModifyApplication(
    action: SysBOAuthorizationAction,
    subject: AuthorizationSubject,
    application: SysBOApplication,
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

  private findUserApplicationLicenses(userId: string, applicationId: string): SysBOLicense[] {
    const result: SysBOLicense[] = [];

    for (const license of this.store.sysLicenses.values()) {
      // A platform-wide mCRM license (no applicationId) grants every app; an
      // application-restricted license grants only its named application. The
      // shared helper also enforces enabled/status/date/quantity semantics.
      if (!licenseGrantsApplicationAccess(license, MCRM_PLATFORM_ID, applicationId)) {
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
