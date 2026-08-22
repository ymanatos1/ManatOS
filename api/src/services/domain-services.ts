import { randomUUID } from 'node:crypto';

import {
  ConflictError,
  NotFoundError,
  SysUserRole,
  operationContext,
  sysApplicationsMetadata,
  sysLicensesMetadata,
  sysPrincipalsMetadata,
  type SysApplication,
  type SysExternalIdentity,
  type SysLicense,
  type SysPrincipal,
  type SysUserPrincipal,
  type SysUserPrincipalRelationship,
} from '@manatos/shared';

import type { InMemoryDataStore } from '../storage/in-memory-data-store.js';

import { GenericSysBOService } from './generic-sysbo-service.js';

import type { SysUserService } from './sys-user-service.js';

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
  override async update(id: string, changes: Partial<SysPrincipal>): Promise<SysPrincipal> {
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

    return super.update(id, changes);
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
   * Create a license only when both referenced entities exist.
   */
  override async create(
    input: Omit<SysLicense, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<SysLicense> {
    const principal = await this.store.sysPrincipals.getById(input.principalId);

    if (!principal) {
      throw new NotFoundError('SysPrincipal', input.principalId);
    }

    const application = await this.store.sysApplications.getById(input.applicationId);

    if (!application) {
      throw new NotFoundError('SysApplication', input.applicationId);
    }

    return super.create(input);
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
  constructor(private readonly store: InMemoryDataStore) {}

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
  ): Promise<SysExternalIdentity> {
    const existing = await this.find(input.provider, input.providerSubject);

    if (existing) {
      throw new ConflictError(
        'EXTERNAL_IDENTITY_EXISTS',

        'External identity already linked.',

        'This external account is already linked.',
      );
    }

    return this.store.executeTransaction(async () => {
      const now = new Date().toISOString();

      const identity: SysExternalIdentity = {
        id: randomUUID(),

        name: `${input.provider}:${input.providerSubject}`,

        userId,

        provider: input.provider,

        providerSubject: input.providerSubject,

        ...(input.email
          ? {
              email: input.email,
            }
          : {}),

        ...(input.emailVerified !== undefined
          ? {
              emailVerified: input.emailVerified,
            }
          : {}),

        ...(input.displayName
          ? {
              displayName: input.displayName,
            }
          : {}),

        enabled: true,

        createdAt: now,

        updatedAt: now,
      };

      this.store.externalIdentities().set(identity.id, identity);

      return identity;
    });
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
          const now = new Date().toISOString();

          const link: SysUserPrincipal = {
            id: randomUUID(),

            name: `${user.name}-${principal.name}`,

            userId,
            principalId,
            relationship,
            isDefault,

            enabled: true,

            createdAt: now,

            updatedAt: now,
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
            );
          }

          return link;
        });
      },
    );
  }
}
