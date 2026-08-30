import { randomUUID } from 'node:crypto';

import {
  ConflictError,
  MANATOS_COMPANY,
  resolvePlatform,
  NotFoundError,
  SysBOUserRole,
  operationContext,
  sysBOApplicationsMetadata,
  sysBOLicensesMetadata,
  sysBOPrincipalsMetadata,
  type SysBOApplication,
  type SysBOCreateInput,
  type SysBOUpdateInput,
  type SysBOExternalIdentity,
  type SysBOLicense,
  type SysBOPrincipal,
  type SysBOUserPrincipal,
  type SysBOUserPrincipalRelationship,
} from '@manatos/shared';

import type { InMemoryDataStore } from '../storage/in-memory-data-store.js';

import { GenericSysBOService } from './generic-sysbo-service.js';

import type { SysBOUserService } from './sys-user-service.js';

import { auditService, type AuditActor } from '../audit/audit-service.js';


function principalTypeCanHaveParent(principalType: SysBOPrincipal['principalType']): boolean {
  const field = sysBOPrincipalsMetadata.fieldDefinition.principalType!;
  const item = field.enumItems?.find((candidate) => candidate.value === principalType);
  return item?.canHaveParent === true;
}

/**
 * Application service for customer/commercial principals.
 */
export class SysBOPrincipalService extends GenericSysBOService<SysBOPrincipal> {
  constructor(store: InMemoryDataStore) {
    super(store, store.sysPrincipals, sysBOPrincipalsMetadata);
  }

  /**
   * Canonical enum-item metadata owns the parentability rule. Principal types
   * whose selected enum item has canHaveParent=false can never persist a parent, even if a caller bypasses the
   * browser and posts directly to the API.
   */
  override async create(
    input: SysBOCreateInput<SysBOPrincipal>,
    actor: AuditActor,
  ): Promise<SysBOPrincipal> {
    const normalized = principalTypeCanHaveParent(input.principalType)
      ? input
      : { ...input, parentId: null };

    if (normalized.parentId && !(await this.repository.getById(normalized.parentId))) {
      throw new NotFoundError('SysBOPrincipal parent', normalized.parentId);
    }

    return super.create(normalized, actor);
  }

  /**
   * Update a principal.
   *
   * Adds domain-specific validation for parent relationships and applies the
   * same declarative parentability trait used by the UI evaluator.
   */
  override async update(
    id: string,
    changes: SysBOUpdateInput<SysBOPrincipal>,
    actor: AuditActor,
  ): Promise<SysBOPrincipal> {
    const current = await this.repository.getById(id);
    if (!current) throw new NotFoundError('SysBOPrincipal', id);

    const effectiveType = changes.principalType ?? current.principalType;
    const normalizedChanges: SysBOUpdateInput<SysBOPrincipal> = principalTypeCanHaveParent(effectiveType)
      ? changes
      : { ...changes, parentId: null };

    /*
     * A principal cannot be its own parent.
     */
    if (normalizedChanges.parentId === id) {
      throw new ConflictError(
        'SELF_PARENT_NOT_ALLOWED',

        'Self-parent is invalid.',

        'A customer cannot be its own parent.',
      );
    }

    /*
     * When a parent is supplied, that principal must exist.
     */
    if (normalizedChanges.parentId && !(await this.repository.getById(normalizedChanges.parentId))) {
      throw new NotFoundError('SysBOPrincipal parent', normalizedChanges.parentId);
    }

    return super.update(id, normalizedChanges, actor);
  }
}

/**
 * Application service for managed applications.
 *
 * No additional domain rules are currently required beyond the
 * generic SysBO behavior.
 */
export class SysBOApplicationService extends GenericSysBOService<SysBOApplication> {
  constructor(store: InMemoryDataStore) {
    super(store, store.sysApplications, sysBOApplicationsMetadata);
  }
}

/**
 * Application service for customer/application licenses.
 */
export class SysBOLicenseService extends GenericSysBOService<SysBOLicense> {
  constructor(store: InMemoryDataStore) {
    super(store, store.sysLicenses, sysBOLicensesMetadata);
  }

  /**
   * Create a Company-owned license for exactly one known platform.
   *
   * `applicationId` is deliberately optional: omitting it creates a
   * platform-wide entitlement. When supplied today it is valid only for a
   * platform that contributes SysBOApplication (currently mCRM).
   */
  override async create(
    input: SysBOCreateInput<SysBOLicense>,
    actor: AuditActor,
  ): Promise<SysBOLicense> {
    const principal = await this.store.sysPrincipals.getById(input.principalId);

    if (!principal) {
      throw new NotFoundError('SysBOPrincipal', input.principalId);
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
        throw new NotFoundError('SysBOApplication', input.applicationId);
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
    changes: SysBOUpdateInput<SysBOLicense>,
    actor: AuditActor,
  ): Promise<SysBOLicense> {
    const existing = await this.get(id);
    if (!existing) {
      throw new NotFoundError('SysBOLicense', id);
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
        throw new NotFoundError('SysBOApplication', applicationId);
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
 * External identities belong to SysBOUser rather than SysBOPrincipal.
 */
export class ExternalIdentityService {
  constructor(
    private readonly store: InMemoryDataStore,
    private readonly users: SysBOUserService,
  ) {}

  /**
   * Find an external identity by provider + provider subject.
   */
  async find(provider: string, subject: string): Promise<SysBOExternalIdentity | null> {
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
   * Return every external authentication identity linked to one SysBOUser.
   */
  async listForUser(userId: string): Promise<SysBOExternalIdentity[]> {
    const user = await this.users.get(userId);

    if (!user) {
      throw new NotFoundError('SysBOUser', userId);
    }

    return [...this.store.externalIdentities().values()]
      .filter((identity) => identity.userId === userId)
      .sort((left, right) => left.provider.localeCompare(right.provider));
  }

  /**
   * Attach an external identity to a SysBOUser.
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
  ): Promise<SysBOExternalIdentity> {
    return operationContext.run(
      'Link external identity to SysBOUser',

      async (scope) => {
        scope.addContext({
          userId,
          provider: input.provider,
          providerSubject: input.providerSubject,
          email: input.email,
        });

        /**
         * Resolve the target user through SysBOUserService rather than directly
         * through store.sysUsers.  Domain services are constructed over the
         * active repository instance, while the in-memory store may rebuild its
         * repository wrappers after a transaction rollback.  Using the user
         * service keeps credential verification, lookup and linking on the same
         * repository abstraction.
         */
        const user = await this.users.get(userId);

        if (!user) {
          throw new NotFoundError('SysBOUser', userId);
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
          const audit = auditService.createStamp(actor);

          const identity: SysBOExternalIdentity = {
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
 *   SysBOUser <-> SysBOPrincipal
 *
 * This keeps website/security identity separate from customer identity.
 */
export class UserPrincipalService {
  constructor(
    private readonly store: InMemoryDataStore,

    private readonly users: SysBOUserService,
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
    relationship: SysBOUserPrincipalRelationship,
    isDefault = false,
    actor: AuditActor,
  ): Promise<SysBOUserPrincipal> {
    return operationContext.run(
      'Link SysBOUser to SysBOPrincipal',

      async (scope) => {
        scope.addContext({
          userId,
          principalId,
          relationship,
        });

        const user = await this.users.get(userId);

        if (!user) {
          throw new NotFoundError('SysBOUser', userId);
        }

        const principal = await this.store.sysPrincipals.getById(principalId);

        if (!principal) {
          throw new NotFoundError('SysBOPrincipal', principalId);
        }

        return this.store.executeTransaction(async () => {
          const audit = auditService.createStamp(actor);

          const link: SysBOUserPrincipal = {
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
           * Acquiring a SysBOPrincipal relationship promotes the
           * account to User.
           */
          if (user.role === SysBOUserRole.Guest) {
            await this.store.sysUsers.update(
              user.id,
              {
                role: SysBOUserRole.User,
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
