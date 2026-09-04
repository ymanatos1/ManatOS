import { randomUUID } from 'node:crypto';
import {
  NotFoundError,
  SysBOUserRole,
  operationContext,
  type SysBOUserPrincipal,
  type SysBOUserPrincipalRelationship,
} from '@manatos/shared';
import type { InMemoryDataStore } from '../storage/in-memory-data-store.js';
import type { SysBOUserService } from './sys-user-service.js';
import { auditService, type AuditActor } from '../audit/audit-service.js';

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
