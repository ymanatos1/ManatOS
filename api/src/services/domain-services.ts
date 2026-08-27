import { randomUUID } from 'node:crypto';

import {
  ConflictError,
  MANATOS_COMPANY,
  resolvePlatform,
  NotFoundError,
  SysUserRole,
  operationContext,
  sysApplicationsMetadata,
  sysLicensesMetadata,
  sysPrincipalsMetadata,
  type SysApplication,
  type SysBOCreateInput,
  type SysBOUpdateInput,
  type SysExternalIdentity,
  type SysLicense,
  type SysPrincipal,
  type SysUserPrincipal,
  type SysUserPrincipalRelationship,
} from '@manatos/shared';

import type { InMemoryDataStore } from '../storage/in-memory-data-store.js';

import { GenericSysBOService } from './generic-sysbo-service.js';

import type { SysUserService } from './sys-user-service.js';

import { auditService, type AuditActor } from '../audit/audit-service.js';

/**
 * Application service for customer/commercial principals.
 */
export class SysPrincipalService extends GenericSysBOService<SysPrincipal> {
  constructor(store: InMemoryDataStore) {
    super(store, store.sysPrincipals, sysPrincipalsMetadata);
  }

  /**
   * Update a principal.
   *
   * Adds domain-specific validation for parent relationships.
   */
  override async update(
    id: string,
    changes: SysBOUpdateInput<SysPrincipal>,
    actor: AuditActor,
  ): Promise<SysPrincipal> {
    /*
     * A principal cannot be its own parent.
     */
    if (changes.parentId === id) {
      throw new ConflictError(
        'SELF_PARENT_NOT_ALLOWED',

        'Self-parent is invalid.',

        'A customer cannot be its own parent.',
      );
    }

    /*
     * When a parent is supplied, that principal must exist.
     */
    if (changes.parentId && !(await this.repository.getById(changes.parentId))) {
      throw new NotFoundError('SysPrincipal parent', changes.parentId);
    }

    return super.update(id, changes, actor);
  }
}

/**
 * Application service for managed applications.
 *
 * No additional domain rules are currently required beyond the
 * generic SysBO behavior.
 */
export class SysApplicationService extends GenericSysBOService<SysApplication> {
  constructor(store: InMemoryDataStore) {
    super(store, store.sysApplications, sysApplicationsMetadata);
  }
}

/**
 * Application service for customer/application licenses.
 */
export class SysLicenseService extends GenericSysBOService<SysLicense> {
  constructor(store: InMemoryDataStore) {
    super(store, store.sysLicenses, sysLicensesMetadata);
  }

  /**
   * Create a Company-owned license for exactly one known platform.
   *
   * `applicationId` is deliberately optional: omitting it creates a
   * platform-wide entitlement. When supplied today it is valid only for a
   * platform that contributes SysApplication (currently mCRM).
   */
  override async create(
    input: SysBOCreateInput<SysLicense>,
    actor: AuditActor,
  ): Promise<SysLicense> {
    const principal = await this.store.sysPrincipals.getById(input.principalId);

    if (!principal) {
      throw new NotFoundError('SysPrincipal', input.principalId);
    }

    const platform = resolvePlatform(MANATOS_COMPANY, input.platformId);
    if (platform.id !== input.platformId) {
      throw new NotFoundError('Platform', input.platformId);
    }

    if (input.applicationId) {
      if (!platform.entities.some((entity) => entity.sysBOKey === 'sys-applications')) {
        throw new ConflictError(
          'PLATFORM_APPLICATIONS_UNAVAILABLE',
          'Application restriction is unavailable for this platform.',
          `Platform '${platform.name}' does not provide applications.`,
        );
      }

      const application = await this.store.sysApplications.getById(input.applicationId);
      if (!application) {
        throw new NotFoundError('SysApplication', input.applicationId);
      }
    }

    return super.create(input, actor);
  }

  /**
   * Revalidate platform/application references when either side of the
   * license scope changes. This keeps PATCH/PUT behavior consistent with
   * creation and prevents an invalid cross-platform restriction.
   */
  override async update(
    id: string,
    changes: SysBOUpdateInput<SysLicense>,
    actor: AuditActor,
  ): Promise<SysLicense> {
    const existing = await this.get(id);
    if (!existing) {
      throw new NotFoundError('SysLicense', id);
    }

    const platformId = changes.platformId ?? existing.platformId;
    const applicationId = changes.applicationId !== undefined
      ? changes.applicationId
      : existing.applicationId;

    const platform = resolvePlatform(MANATOS_COMPANY, platformId);
    if (platform.id !== platformId) {
      throw new NotFoundError('Platform', platformId);
    }

    if (applicationId) {
      if (!platform.entities.some((entity) => entity.sysBOKey === 'sys-applications')) {
        throw new ConflictError(
          'PLATFORM_APPLICATIONS_UNAVAILABLE',
          'Application restriction is unavailable for this platform.',
          `Platform '${platform.name}' does not provide applications.`,
        );
      }

      const application = await this.store.sysApplications.getById(applicationId);
      if (!application) {
        throw new NotFoundError('SysApplication', applicationId);
      }
    }

    return super.update(id, changes, actor);
  }
}

/**
 * Service responsible for external authentication identities.
 *
 * Examples:
 *
 * - Google
 * - Facebook
 * - future OAuth/OIDC providers
 *
 * External identities belong to SysUser rather than SysPrincipal.
 */
export class ExternalIdentityService {
  constructor(
    private readonly store: InMemoryDataStore,
    private readonly users: SysUserService,
  ) {}

  /**
   * Find an external identity by provider + provider subject.
   */
  async find(provider: string, subject: string): Promise<SysExternalIdentity | null> {
    for (const identity of this.store.externalIdentities().values()) {
      const sameProvider = identity.provider.toLowerCase() === provider.toLowerCase();

      const sameSubject = identity.providerSubject === subject;

      if (sameProvider && sameSubject) {
        return identity;
      }
    }

    return null;
  }

  /**
   * Return every external authentication identity linked to one SysUser.
   */
  async listForUser(userId: string): Promise<SysExternalIdentity[]> {
    const user = await this.users.get(userId);

    if (!user) {
      throw new NotFoundError('SysUser', userId);
    }

    return [...this.store.externalIdentities().values()]
      .filter((identity) => identity.userId === userId)
      .sort((left, right) => left.provider.localeCompare(right.provider));
  }

  /**
   * Attach an external identity to a SysUser.
   *
   * Provider + providerSubject must be unique.
   */
  async add(
    userId: string,

    input: {
      provider: string;
      providerSubject: string;

      email?: string;
      emailVerified?: boolean;
      displayName?: string;
    },

    actor: AuditActor,
  ): Promise<SysExternalIdentity> {
    return operationContext.run(
      'Link external identity to SysUser',

      async (scope) => {
        scope.addContext({
          userId,
          provider: input.provider,
          providerSubject: input.providerSubject,
          email: input.email,
        });

        /**
         * Resolve the target user through SysUserService rather than directly
         * through store.sysUsers.  Domain services are constructed over the
         * active repository instance, while the in-memory store may rebuild its
         * repository wrappers after a transaction rollback.  Using the user
         * service keeps credential verification, lookup and linking on the same
         * repository abstraction.
         */
        const user = await this.users.get(userId);

        if (!user) {
          throw new NotFoundError('SysUser', userId);
        }

        const existing = await this.find(input.provider, input.providerSubject);

        if (existing) {
          throw new ConflictError(
            'EXTERNAL_IDENTITY_EXISTS',

            'External identity already linked.',

            'This external account is already linked.',
          );
        }

        return this.store.executeTransaction(async () => {
          const audit = auditService.createStamp(actor, 'sys-external-identities');

          const identity: SysExternalIdentity = {
            id: randomUUID(),

            name: `${input.provider}:${input.providerSubject}`,

            userId: user.id,

            provider: input.provider,

            providerSubject: input.providerSubject,

            ...(input.email ? { email: input.email } : {}),

            ...(input.emailVerified !== undefined ? { emailVerified: input.emailVerified } : {}),

            ...(input.displayName ? { displayName: input.displayName } : {}),

            enabled: true,

            ...audit,
          };

          this.store.externalIdentities().set(identity.id, identity);

          return identity;
        });
      },
    );
  }
}

/**
 * Service responsible for relationships between:
 *
 *   SysUser <-> SysPrincipal
 *
 * This keeps website/security identity separate from customer identity.
 */
export class UserPrincipalService {
  constructor(
    private readonly store: InMemoryDataStore,

    private readonly users: SysUserService,
  ) {}

  /**
   * Link a website user to a customer/commercial principal.
   *
   * Once a Guest acquires a customer relationship, the user's role
   * is automatically promoted from Guest to User.
   */
  async link(
    userId: string,
    principalId: string,
    relationship: SysUserPrincipalRelationship,
    isDefault = false,
    actor: AuditActor,
  ): Promise<SysUserPrincipal> {
    return operationContext.run(
      'Link SysUser to SysPrincipal',

      async (scope) => {
        scope.addContext({
          userId,
          principalId,
          relationship,
        });

        const user = await this.users.get(userId);

        if (!user) {
          throw new NotFoundError('SysUser', userId);
        }

        const principal = await this.store.sysPrincipals.getById(principalId);

        if (!principal) {
          throw new NotFoundError('SysPrincipal', principalId);
        }

        return this.store.executeTransaction(async () => {
          const audit = auditService.createStamp(actor, 'sys-user-principals');

          const link: SysUserPrincipal = {
            id: randomUUID(),

            name: `${user.name}-${principal.name}`,

            userId,
            principalId,
            relationship,
            isDefault,

            enabled: true,

            ...audit,
          };

          this.store.userPrincipals().set(link.id, link);

          /*
           * A registered account without a customer relationship
           * starts as Guest.
           *
           * Acquiring a SysPrincipal relationship promotes the
           * account to User.
           */
          if (user.role === SysUserRole.Guest) {
            await this.store.sysUsers.update(
              user.id,
              {
                role: SysUserRole.User,
              },
              actor,
            );
          }

          return link;
        });
      },
    );
  }
}
