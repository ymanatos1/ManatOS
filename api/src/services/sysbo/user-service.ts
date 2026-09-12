import argon2 from 'argon2';

import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  SysBOPrincipalType,
  SysBOUserRole,
  ValidationAppError,
  operationContext,
  sysBOUsersMetadata,
  validatePassword,
  type EmailVerificationSource,
  type SysBOUser,
  type SysBOCreateInput,
  type SysBOUpdateInput,
} from '@manatos/shared';

import type { InMemoryDataStore } from '../../storage/in-memory-data-store.js';

import { GenericSysBOService } from './generic-service.js';
import {
  SYSTEM_AUDIT_ACTOR,
  registrationAuditActor,
  type AuditActor,
} from '../../audit/audit-service.js';

/**
 * Input accepted when creating a website SysBOUser.
 *
 * Technical persistence fields such as:
 *
 * - id
 * - createdAt
 * - updatedAt
 * - passwordHash
 *
 * are not supplied directly by the caller.
 */
export interface CreateSysBOUserInput {
  name: string;
  email: string;
  telephoneNumber?: string;

  password?: string;

  role?: SysBOUserRole;

  firstName?: string;
  lastName?: string;
  description?: string;

  emailVerified?: boolean;
  emailVerificationSource?: EmailVerificationSource;
  enabled?: boolean;
}

/**
 * Application service for website/security users.
 *
 * SysBOUser represents a website identity and is deliberately
 * separate from SysBOPrincipal, which represents a customer or
 * commercial identity.
 */
export class SysBOUserService extends GenericSysBOService<SysBOUser> {
  constructor(store: InMemoryDataStore) {
    super(store, store.sysUsers, sysBOUsersMetadata);
  }

  /** Enforce the canonical optional 1:1 SysUser -> Person Principal identity link. */
  private async validatePrincipalIdentityLink(
    principalId: string | null | undefined,
    currentUserId?: string,
  ): Promise<void> {
    if (!principalId) return;
    const principal = await this.store.sysPrincipals.getById(principalId);
    if (!principal) throw new NotFoundError('SysBOPrincipal', principalId);
    if (principal.principalType !== SysBOPrincipalType.Person) {
      throw new ConflictError(
        'USER_PRINCIPAL_MUST_BE_PERSON',
        'A User account can only be linked to a Person Principal.',
        'Choose a Principal whose Principal type is Person.',
      );
    }
    for (const user of this.store.sysUsers.values()) {
      if (user.id !== currentUserId && user.principalId === principalId) {
        throw new ConflictError(
          'USER_PRINCIPAL_ALREADY_LINKED',
          `Principal '${principal.name}' is already linked to User '${user.name}'.`,
          'Choose an unlinked Person Principal.',
        );
      }
    }
  }

  override async create(input: SysBOCreateInput<SysBOUser>, actor: AuditActor): Promise<SysBOUser> {
    const initialized = this.applyCreateDefaults(input);
    await this.validatePrincipalIdentityLink(initialized.principalId);
    return super.create(initialized, actor);
  }

  override async update(
    id: string,
    changes: SysBOUpdateInput<SysBOUser>,
    actor: AuditActor,
  ): Promise<SysBOUser> {
    if (Object.prototype.hasOwnProperty.call(changes, 'principalId')) {
      const actingUser = actor.userId ? await this.store.sysUsers.getById(actor.userId) : null;
      if (actor.source === 'user' && actingUser?.role !== SysBOUserRole.Admin) {
        throw new ConflictError(
          'USER_PRINCIPAL_ADMIN_REQUIRED',
          'Only an Administrator can change a User identity Principal.',
          'Ask an Administrator to change this relationship.',
        );
      }
      await this.validatePrincipalIdentityLink(changes.principalId, id);
    }
    return super.update(id, changes, actor);
  }

  /**
   * Create a new website account.
   *
   * The supplied password is optional because accounts created through
   * external identity providers may initially have no local password.
   *
   * When supplied, the password is validated and stored only as an
   * Argon2id hash.
   */
  //async createUser(input: CreateSysBOUserInput): Promise<SysBOUser> {
  async createUser(input: CreateSysBOUserInput, actor: AuditActor): Promise<SysBOUser> {
    return operationContext.run(
      'Prepare SysBOUser account',

      async (scope) => {
        /*
         * OperationScope automatically masks password because its
         * property name is classified as sensitive.
         */
        scope.addContext({
          name: input.name,
          email: input.email,
          password: input.password,
        });

        const passwordHash = input.password ? await this.hashPassword(input.password) : null;

        const passwordChangedAt = passwordHash ? new Date().toISOString() : null;

        return this.create(
          {
            name: input.name.trim(),

            email: input.email.trim().toLowerCase(),

            ...(input.telephoneNumber ? { telephoneNumber: input.telephoneNumber } : {}),

            emailVerified: input.emailVerified ?? false,

            ...((input.emailVerified ?? false)
              ? {
                  emailVerifiedAt: new Date().toISOString(),
                  emailVerificationSource: input.emailVerificationSource ?? 'internal',
                }
              : {
                  emailVerifiedAt: null,
                  emailVerificationSource: null,
                }),

            passwordHash,
            passwordChangedAt,

            role: input.role ?? SysBOUserRole.Guest,

            ...(input.firstName
              ? {
                  firstName: input.firstName,
                }
              : {}),

            ...(input.lastName
              ? {
                  lastName: input.lastName,
                }
              : {}),

            ...(input.description
              ? {
                  description: input.description,
                }
              : {}),

            enabled: input.enabled ?? true,
          },
          actor,
        );
      },
    );
  }

  /**
   * Business-rule hook for future qualifying license/provisioning transactions.
   * The entitlement workflow can call this inside the same datastore transaction:
   * a Guest becomes User, while existing User/Admin roles remain unchanged.
   *
   * Identity-link changes deliberately do NOT invoke this rule.
   */
  async promoteGuestForEntitlement(userId: string, actor: AuditActor): Promise<SysBOUser> {
    const user = await this.get(userId);
    if (!user) throw new NotFoundError('SysBOUser', userId);
    if (user.role !== SysBOUserRole.Guest) return user;
    return this.update(userId, { role: SysBOUserRole.User }, actor);
  }

  /**
   * Public website registration.
   *
   * The caller can never choose User/Admin here.
   */
  async registerGuest(
    input: Omit<CreateSysBOUserInput, 'role' | 'emailVerified'>,
  ): Promise<SysBOUser> {
    return this.createUser(
      {
        ...input,

        role: SysBOUserRole.Guest,

        emailVerified: false,
        enabled: true,
      },

      registrationAuditActor(input.name),
    );
  }

  /**
   * Locate a user by either:
   *
   * - unique user-name; or
   * - unique email address.
   */
  async lookupByIdentity(identity: string): Promise<SysBOUser | null> {
    const byName = await this.repository.findByUnique('name', identity);

    if (byName) {
      return byName;
    }

    return this.repository.findByUnique('email', identity.trim().toLowerCase());
  }

  /**
   * Authenticate a user using local credentials.
   *
   * Accounts without passwordHash cannot authenticate locally,
   * but may still authenticate through an external provider.
   */
  async verifyLocalCredentials(identity: string, password: string): Promise<SysBOUser> {
    return operationContext.run(
      'Verify local SysBOUser credentials',

      async (scope) => {
        scope.addContext({
          identity,
          password,
        });

        const user = await this.lookupByIdentity(identity);

        /*
         * Do not disclose which part of authentication failed.
         *
         * The same AuthenticationError is returned for:
         *
         * - unknown user;
         * - disabled user;
         * - account without local password;
         * - incorrect password.
         */
        if (!user || !user.enabled || !user.passwordHash) {
          throw new AuthenticationError();
        }

        const passwordMatches = await argon2.verify(user.passwordHash, password);

        if (!passwordMatches) {
          throw new AuthenticationError();
        }

        return user;
      },
    );
  }

  /**
   * Set or replace the user's local password.
   *
   * This also allows an externally registered account to acquire
   * local email/user-name + password authentication later.
   */
  async setPassword(id: string, password: string, actor: AuditActor): Promise<SysBOUser> {
    const passwordHash = await this.hashPassword(password);

    return this.update(
      id,

      {
        passwordHash,

        passwordChangedAt: new Date().toISOString(),
      },

      actor,
    );
  }

  /**
   * Change or establish the currently authenticated user's local password.
   *
   * If a password already exists, the current password must be supplied.
   *
   * An externally authenticated account without a local password may set
   * its first local password without an old password because possession
   * of the Bearer token already proves authenticated account access.
   */
  async changePassword(
    userId: string,
    currentPassword: string | undefined,
    newPassword: string,
    actor: AuditActor,
  ): Promise<SysBOUser> {
    const user = await this.get(userId);

    if (!user) {
      throw new AuthenticationError();
    }

    if (user.passwordHash) {
      if (!currentPassword) {
        throw new AuthenticationError();
      }

      const valid = await argon2.verify(user.passwordHash, currentPassword);

      if (!valid) {
        throw new AuthenticationError();
      }
    }

    return this.setPassword(userId, newPassword, actor);
  }

  /**
   * Mark the user's email address as verified.
   */
  async setEmailVerified(
    id: string,
    actor: AuditActor,
    source: EmailVerificationSource = 'internal',
  ): Promise<SysBOUser> {
    const user = await this.get(id);

    if (!user) {
      throw new NotFoundError('SysBOUser', id);
    }

    /*
     * Verification provenance records how the CURRENT ManatOS email first
     * became trusted. Linking/authenticating another provider later must not
     * rewrite that history.
     */
    if (user.emailVerified) {
      return user;
    }

    return this.update(
      id,

      {
        emailVerified: true,
        emailVerifiedAt: new Date().toISOString(),
        emailVerificationSource: source,
      },
      actor,
    );
  }

  /**
   * Create the optional bootstrap administrator.
   *
   * Bootstrap occurs only when:
   *
   * - the SysBOUser repository is empty;
   * - name is supplied;
   * - email is supplied;
   * - password is supplied.
   *
   * This mechanism is independent from the reset-data development seed.
   */
  async bootstrapAdmin(name?: string, email?: string, password?: string): Promise<void> {
    if (this.repository.values().length > 0 || !name || !email || !password) {
      return;
    }

    await this.createUser(
      {
        name,
        email,
        password,

        emailVerified: true,
        emailVerificationSource: 'internal',

        role: SysBOUserRole.Admin,

        description: 'Bootstrap administrator created from environment configuration.',
      },
      SYSTEM_AUDIT_ACTOR,
    );
  }

  /**
   * Validate and securely hash a local password.
   *
   * Password policy is centralized in the shared package so the same
   * rules can be reused by the API and UI.
   */
  private async hashPassword(password: string): Promise<string> {
    const failures = validatePassword(password);

    if (failures.length > 0) {
      throw new ValidationAppError(failures.join(' '));
    }

    return argon2.hash(
      password,

      {
        type: argon2.argon2id,
      },
    );
  }
}
