import argon2 from 'argon2';

import {
  AuthenticationError,
  NotFoundError,
  SysUserRole,
  ValidationAppError,
  operationContext,
  sysUsersMetadata,
  validatePassword,
  type EmailVerificationSource,
  type SysUser,
} from '@manatos/shared';

import type { InMemoryDataStore } from '../storage/in-memory-data-store.js';

import { GenericSysBOService } from './generic-sysbo-service.js';
import {
  SYSTEM_AUDIT_ACTOR,
  registrationAuditActor,
  type AuditActor,
} from '../audit/audit-service.js';

/**
 * Input accepted when creating a website SysUser.
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
export interface CreateSysUserInput {
  name: string;
  email: string;

  password?: string;

  role?: SysUserRole;

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
 * SysUser represents a website identity and is deliberately
 * separate from SysPrincipal, which represents a customer or
 * commercial identity.
 */
export class SysUserService extends GenericSysBOService<SysUser> {
  constructor(store: InMemoryDataStore) {
    super(store, store.sysUsers, sysUsersMetadata);
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
  //async createUser(input: CreateSysUserInput): Promise<SysUser> {
  async createUser(input: CreateSysUserInput, actor: AuditActor): Promise<SysUser> {
    return operationContext.run(
      'Prepare SysUser account',

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

            role: input.role ?? SysUserRole.Guest,

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
   * Public website registration.
   *
   * The caller can never choose User/Admin here.
   */
  async registerGuest(input: Omit<CreateSysUserInput, 'role' | 'emailVerified'>): Promise<SysUser> {
    return this.createUser(
      {
        ...input,

        role: SysUserRole.Guest,

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
  async lookupByIdentity(identity: string): Promise<SysUser | null> {
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
  async verifyLocalCredentials(identity: string, password: string): Promise<SysUser> {
    return operationContext.run(
      'Verify local SysUser credentials',

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
  async setPassword(id: string, password: string, actor: AuditActor): Promise<SysUser> {
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
  ): Promise<SysUser> {
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
  ): Promise<SysUser> {
    const user = await this.get(id);

    if (!user) {
      throw new NotFoundError('SysUser', id);
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
   * - the SysUser repository is empty;
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

        role: SysUserRole.Admin,

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
