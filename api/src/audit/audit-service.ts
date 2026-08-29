import type { SysBOEntity } from '@manatos/shared';

/**
 * Describes the actor responsible for a data-changing operation.
 *
 * Only userName is currently persisted directly into SysBO records.
 *
 * The richer actor context is intentionally retained here so that
 * future auditing can evolve without changing every repository method.
 */
export interface AuditActor {
  /**
   * SysBOUser Id when the operation is performed by an authenticated user.
   *
   * System/internal operations may not have a corresponding SysBOUser.
   */
  userId?: string;

  /**
   * Human-readable/login name currently persisted into:
   *
   *   createdBy
   *   updatedBy
   */
  userName: string;

  /**
   * Identifies how the operation originated.
   *
   * This is not currently persisted in SysBO records, but is retained
   * for future audit-event/history support.
   */
  source: 'user' | 'self-registration' | 'system' | 'internal';
}

/**
 * Audit values assigned when a new entity is created.
 *
 * Explicitly defining this contract keeps the audit subsystem independent
 * from future additions or restructuring of SysBOEntity.
 */
export interface CreateAuditStamp {
  createdAt: string;
  createdBy: string;

  updatedAt: string;
  updatedBy: string;
}

/**
 * Audit values assigned when an existing entity is updated.
 */
export interface UpdateAuditStamp {
  updatedAt: string;
  updatedBy: string;
}

/**
 * Central audit service.
 *
 * At present the persisted audit model is intentionally simple:
 *
 *   createdAt
 *   createdBy
 *   updatedAt
 *   updatedBy
 *
 * Repositories ask this service for audit information instead of
 * generating it themselves.
 *
 * This provides an extension point for future capabilities such as:
 *
 * - revision history;
 * - before/after values;
 * - audit event tables;
 * - application-specific audit policies;
 * - approval workflows;
 * - security context;
 * - reason/comment fields;
 * - correlation/request Id;
 * - source IP or client information where appropriate.
 *
 * SysBOApplication auditing can therefore become richer later without
 * redesigning the generic repository API.
 */
export class AuditService {
  /**
   * Generate audit information for entity creation.
   *
   * Creation initializes both the creation and latest-update fields
   * to the same actor and timestamp.
   */
  createStamp(actor: AuditActor): CreateAuditStamp {
    const now = new Date().toISOString();

    return {
      createdAt: now,

      createdBy: actor.userName,

      updatedAt: now,

      updatedBy: actor.userName,
    };
  }

  /**
   * Generate audit information for an entity update.
   */
  updateStamp(actor: AuditActor): UpdateAuditStamp {
    return {
      updatedAt: new Date().toISOString(),

      updatedBy: actor.userName,
    };
  }

  /**
   * Hook executed immediately before an entity is deleted.
   *
   * The current JSON/in-memory implementation physically removes
   * the record and therefore has nowhere to persist deletion audit data.
   *
   * Keeping this hook now means that later we can add:
   *
   * - deletion audit events;
   * - soft deletion;
   * - deletedBy / deletedAt;
   * - application-specific deletion history;
   *
   * without changing every service/repository caller.
   */
  async beforeDelete(_actor: AuditActor, _sysBOKey: string, _entity: SysBOEntity): Promise<void> {
    // TODO: Persist a deletion audit event (or introduce soft-delete metadata) before
    // consuming these values. The hook contract is intentionally retained so callers
    // already provide the actor, SysBO identity and deleted entity when that audit
    // capability is introduced. Keep the lint findings visible until then.
  }
}

/**
 * Shared singleton used by the current repository implementation.
 */
export const auditService = new AuditService();

/**
 * Actor used for background/system-generated changes.
 */
export const SYSTEM_AUDIT_ACTOR: AuditActor = {
  userName: 'System',

  source: 'system',
};

/**
 * Build an audit actor for an authenticated SysBOUser.
 */
export function authenticatedAuditActor(userId: string, userName: string): AuditActor {
  return {
    userId,
    userName,

    source: 'user',
  };
}

/**
 * Build the audit actor used during public self-registration.
 *
 * At this point the new SysBOUser does not yet have a generated Id,
 * so the unique user-name is the available identity for auditing.
 */
export function registrationAuditActor(userName: string): AuditActor {
  return {
    userName,

    source: 'self-registration',
  };
}

/**
 * Build an audit actor for trusted internal API operations.
 *
 * Internal API calls are authenticated with the internal API key rather
 * than a SysBOUser Bearer token, so they may not have a SysBOUser Id.
 */
export function internalAuditActor(userName = 'InternalApi'): AuditActor {
  return {
    userName,
    source: 'internal',
  };
}
