import {
  ForbiddenAppError,
  SysBOUserRole,
  type SysBOAuthorizationCapabilities,
  type PlatformAuthorizationCapabilities,
  type SysBOEntity,
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
 * Central authorization service for SysBO access.
 *
 * Read:
 *   Company-owned entities follow their record rules; protoCRM applications are
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
  constructor(store: InMemoryDataStore) {
    void store;
  }

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

  /**
   * Resolve the capability set exposed to clients for one SysBO scope.
   *
   * Collection scope has no target record, therefore update/delete are false.
   * Record scope reuses the exact same can() policy used by mutation routes.
   *
   * This is a projection only. Every eventual API operation must still call
   * assertCan()/can() at execution time so clients can never turn a stale
   * capability snapshot into authorization.
   */
  async capabilities(
    subject: AuthorizationSubject,
    sysBOKey: string,
    record?: SysBOEntity,
  ): Promise<SysBOAuthorizationCapabilities> {
    const [read, create, update, remove] = await Promise.all([
      this.can('read', subject, sysBOKey, record),
      this.can('create', subject, sysBOKey),
      record ? this.can('update', subject, sysBOKey, record) : Promise.resolve(false),
      record ? this.can('delete', subject, sysBOKey, record) : Promise.resolve(false),
    ]);

    return {
      read,
      create,
      update,
      delete: remove,
    };
  }

  /**
   * Resolve safe platform-level capability facts for UI/other clients.
   *
   * This deliberately owns the Admin bypass and license/principal traversal so
   * no client needs enough raw authorization inputs to reconstruct policy.
   */
  async platformCapabilities(
    subject: AuthorizationSubject,
    platformId: string,
  ): Promise<PlatformAuthorizationCapabilities> {
    // Platform-specific entitlement evaluation is intentionally deferred until the
    // licensing authorization model is introduced. Keep the platform argument in
    // the contract because capabilities remain platform-scoped.
    void platformId;

    return {
      platformAccess: subject.role === SysBOUserRole.Admin,
    };
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
      return (
        subject.role === SysBOUserRole.Admin && record !== undefined && record.id !== subject.userId
      );
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
    /** Platform applications are Admin-only until the new license authorization model lands. */
    if (action === 'read' && sysBOKey === 'sys-applications') return false;
    /** License administration remains Admin-only while entitlement rules are redesigned. */
    if (action === 'read' && sysBOKey === 'sys-licenses') return false;

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
      case 'sys-licenses':
      case 'sys-applications':
        return false;

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
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}
