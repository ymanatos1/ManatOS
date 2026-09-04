import { randomUUID } from 'node:crypto';
import {
  ConflictError,
  NotFoundError,
  operationContext,
  type SysBOExternalIdentity,
} from '@manatos/shared';
import type { InMemoryDataStore } from '../storage/in-memory-data-store.js';
import type { SysBOUserService } from './sys-user-service.js';
import { auditService, type AuditActor } from '../audit/audit-service.js';

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
