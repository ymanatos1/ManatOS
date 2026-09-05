import { Router, type Request, type RequestHandler } from 'express';

import {
  AuthenticationError,
  ForbiddenAppError,
  SysBOUserRole,
  NotFoundError,
  ValidationAppError,
  operationContext,
  type SysBOEntity,
  type SysBOMetadata,
  type SysBOUIMetadata,
} from '@manatos/shared';

import { authenticatedAuditActor, type AuditActor } from '../audit/audit-service.js';

import type { AuthorizationService } from '../auth/authorization-service.js';

import type { GenericSysBOService } from '../services/generic-sysbo-service.js';

import { getEffectiveSysBOUIMetadata } from '../metadata/sysbo-ui-registry.js';

import { parseListQuery } from './query.js';

import { sendCommand, sendQuery } from './api-response.js';

/**
 * Builds the standard REST CRUD router for a metadata-driven SysBO.
 *
 * Business-object metadata and actual business data remain separate.
 *
 * Metadata is returned:
 *
 *   GET /$metadata
 *   GET /$metadata-ui
 *
 * or optionally alongside a list when:
 *
 *   ?includeMetadata=true
 *   ?includeMetadataUI=true
 *
 * includeMetadataUI=true implies includeMetadata=true
 *
 * GET/query responses return:
 *
 *   success + data
 *
 * Mutating operations return:
 *
 *   success + message + data
 */
export function createSysBORouter<T extends SysBOEntity>(
  service: GenericSysBOService<T>,
  metadata: SysBOMetadata<T>,

  authorization: AuthorizationService,

  /**
   * Optional entity-specific creation hook.
   *
   * SysBOUser uses this because creation may involve password hashing
   * and other account-specific processing before persistence.
   */

  customCreate?: (body: Record<string, unknown>, actor: AuditActor) => Promise<T>,
  customUpdate?: (id: string, body: Record<string, unknown>, actor: AuditActor) => Promise<T>,
): Router {
  const router = Router();

  /**
   * Return the hard-coded, UI-neutral BO metadata.
   */
  router.get('/$metadata', async (req, res) => {
    const subject = securityContext(req);
    await authorization.assertCan('read', subject, metadata.key);

    sendQuery(res, {
      metadata,
    });
  });

  /**
   * Return framework-neutral UI metadata for this SysBO when defined.
   *
   * This is a read-only presentation contract intended for EJS today and
   * other UI clients later. It deliberately contains no EJS/Bootstrap detail.
   */
  router.get('/$metadata-ui', async (req, res) => {
    const subject = securityContext(req);
    await authorization.assertCan('read', subject, metadata.key);

    const metadataUI = getEffectiveSysBOUIMetadata(metadata);

    if (!metadataUI) {
      throw new NotFoundError('SysBO UI metadata', metadata.key);
    }

    sendQuery(res, { metadataUI });
  });

  /**
   * List entries with filtering, sorting and pagination.
   */
  router.get('/', async (req, res) => {
    await operationContext.runRoot(
      `List ${metadata.pluralName}`,

      async () => {
        const subject = securityContext(req);
        await authorization.assertCan('read', subject, metadata.key);

        const result = await service.list(
          parseListQuery(req),
          // Current storage is Map-backed, so authorization can filter the
          // materialized collection before client filters/paging. Future RDBMS
          // adapters should translate the same policy into database predicates.
          (items) => authorization.filterListItems(subject, metadata.key, items),
        );

        const includeMetadataUI = req.query.includeMetadataUI === 'true';
        const includeMetadata = includeMetadataUI || req.query.includeMetadata === 'true';
        const metadataUI: SysBOUIMetadata | undefined = includeMetadataUI
          ? getEffectiveSysBOUIMetadata(metadata)
          : undefined;

        sendQuery(res, {
          ...(includeMetadata ? { metadata } : {}),
          ...(metadataUI ? { metadataUI } : {}),

          items: result.items.map((item) => sanitize(item, metadata)),

          paging: {
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
            totalPages: result.totalPages,
          },
        });
      },
    );
  });

  /**
   * Return the authenticated subject's current collection-level capability set.
   *
   * This endpoint is intentionally available even when read=false so the UI/BFF
   * can discover that a SysBO is unavailable without recreating role policy.
   * The returned flags are advisory presentation inputs only; every actual API
   * operation still performs its authoritative authorization check.
   */
  router.get('/$capabilities', async (req, res) => {
    const subject = securityContext(req);

    sendQuery(res, {
      sysBOKey: metadata.key,
      scope: 'collection',
      capabilities: await authorization.capabilities(subject, metadata.key),
    });
  });

  /**
   * Return record-sensitive capabilities for one readable BO entry.
   *
   * Resolving the record first is essential for policies such as Admin
   * self-delete. Read authorization is required before projecting the other
   * flags so this endpoint cannot disclose the existence of an unreadable row.
   */
  router.get('/:id/$capabilities', async (req, res) => {
    const id = String(req.params.id ?? '');
    const item = await service.get(id);

    if (!item) {
      throw new NotFoundError(metadata.name, id);
    }

    const subject = securityContext(req);
    await authorization.assertCan('read', subject, metadata.key, item);

    sendQuery(res, {
      sysBOKey: metadata.key,
      scope: 'record',
      recordId: id,
      capabilities: await authorization.capabilities(subject, metadata.key, item),
    });
  });

  /**
   * Read one BO entry by its generated GUID.
   */
  router.get('/:id', async (req, res) => {
    /*
     * Express 5 types route parameters conservatively as potentially
     * string | string[] | undefined.
     *
     * Our API contract requires exactly one string GUID, so normalize
     * the route value here at the HTTP boundary.
     */
    const id = String(req.params.id ?? '');

    await operationContext.runRoot(
      `Read ${metadata.name}`,

      async (scope) => {
        scope.comment('id', id);

        const item = await service.get(id);

        if (!item) {
          throw new NotFoundError(metadata.name, id);
        }

        const subject = securityContext(req);
        await authorization.assertCan('read', subject, metadata.key, item);

        sendQuery(res, sanitize(item, metadata));
      },
    );
  });

  /**
   * Create one BO entry.
   */
  const createHandler: RequestHandler = async (req, res) => {
    await operationContext.runRoot(
      `Create ${metadata.name}`,

      async (scope) => {
        const subject = securityContext(req);
        await authorization.assertCan('create', subject, metadata.key);

        const actor = authenticatedAuditActor(subject.userId, subject.userName);

        scope.comment('name', req.body?.name);

        /*
         * Some BOs need specialized creation logic.
         *
         * For example, SysBOUser creation hashes a supplied password
         * before persistence.
         */
        const item = customCreate
          ? await customCreate(req.body ?? {}, actor)
          : await service.create(req.body, actor);

        sendCommand(
          res,
          `${metadata.name} '${item.name}' created successfully.`,
          sanitize(item, metadata),
          201,
        );
      },
    );
  };

  router.post('/', createHandler);

  /**
   * Atomically commit an owner-managed aggregate working set. The browser may
   * use temporary draft identities; the service resolves them transactionally.
   */
  router.post('/$aggregate-commit', async (req, res) => {
    if (customCreate || customUpdate) {
      throw new ValidationAppError(
        `${metadata.name} requires specialized persistence and cannot use the generic aggregate commit endpoint.`,
        'This entity does not support generic aggregate Commit.',
      );
    }
    const subject = securityContext(req);
    const entries: Record<string, unknown>[] = Array.isArray(req.body?.entries)
      ? req.body.entries.filter(
          (row: unknown): row is Record<string, unknown> =>
            Boolean(row) && typeof row === 'object' && !Array.isArray(row),
        )
      : [];
    const entriesOriginal: Record<string, unknown>[] = Array.isArray(req.body?.entriesOriginal)
      ? req.body.entriesOriginal.filter(
          (row: unknown): row is Record<string, unknown> =>
            Boolean(row) && typeof row === 'object' && !Array.isArray(row),
        )
      : [];
    const identityField = String(req.body?.identityField || 'id');
    const originalIds = new Set<string>(
      entriesOriginal.map((row) => String(row[identityField] ?? '')).filter(Boolean),
    );
    const currentIds = new Set<string>(
      entries.map((row) => String(row[identityField] ?? '')).filter(Boolean),
    );
    const unexpectedPersistedId = entries
      .map((row) => String(row[identityField] ?? ''))
      .find((id) => id && !id.startsWith('draft:') && !originalIds.has(id));
    if (unexpectedPersistedId) {
      throw new ValidationAppError(
        `Aggregate commit contains persisted id '${unexpectedPersistedId}' outside entriesOriginal.`,
        'The aggregate working set no longer matches its original baseline.',
      );
    }

    if (entries.some((row) => String(row[identityField] ?? '').startsWith('draft:'))) {
      await authorization.assertCan('create', subject, metadata.key);
    }
    for (const row of entries) {
      const id = String(row[identityField] ?? '');
      if (!id || id.startsWith('draft:') || !originalIds.has(id)) continue;
      const existing = await service.get(id);
      if (!existing) throw new NotFoundError(metadata.name, id);
      await authorization.assertCan('update', subject, metadata.key, existing);
    }
    for (const id of originalIds) {
      if (currentIds.has(id)) continue;
      const existing = await service.get(id);
      if (!existing) throw new NotFoundError(metadata.name, id);
      await authorization.assertCan('delete', subject, metadata.key, existing);
    }

    const actor = authenticatedAuditActor(subject.userId, subject.userName);
    const result = await service.commitAggregate(
      { entries, entriesOriginal, identityField },
      actor,
    );
    sendCommand(res, `${metadata.name} aggregate committed successfully.`, {
      items: result.items.map((item) => sanitize(item, metadata)),
      idMap: result.idMap,
    });
  });

  /**
   * Shared implementation for PUT and PATCH.
   *
   * For the baseline both operations currently delegate to the same
   * partial-update service behavior.
   */
  const updateHandler: RequestHandler = async (req, res) => {
    const id = String(req.params.id ?? '');

    await operationContext.runRoot(
      `Update ${metadata.name}`,

      async (scope) => {
        const subject = securityContext(req);

        const existing = await service.get(id);

        if (!existing) {
          throw new NotFoundError(metadata.name, id);
        }

        await authorization.assertCan('update', subject, metadata.key, existing);

        /**
         * Role assignment is an administrator capability, independent from a
         * user's ability to update other fields on their own SysBOUser record.
         * This also guarantees that the new Superuser role cannot be granted
         * by a User/Superuser through a direct API PATCH.
         */
        if (
          metadata.key === 'sys-users' &&
          req.body?.role !== undefined &&
          req.body.role !== (existing as { role?: unknown }).role &&
          subject.role !== SysBOUserRole.Admin
        ) {
          throw new ForbiddenAppError('Only an Admin may change a user role.');
        }

        const actor = authenticatedAuditActor(subject.userId, subject.userName);

        scope.addContext({
          id,
          name: req.body?.name,
        });

        const item = customUpdate
          ? await customUpdate(id, req.body ?? {}, actor)
          : await service.update(id, req.body, actor);

        sendCommand(
          res,
          `${metadata.name} '${item.name}' updated successfully.`,
          sanitize(item, metadata),
        );
      },
    );
  };

  router.put('/:id', updateHandler);

  router.patch('/:id', updateHandler);

  /**
   * Preview metadata-driven referential consequences without mutating data.
   * Interactive UIs can use this before confirmation; the server recalculates
   * the plan again when DELETE executes so stale client plans are never trusted.
   */
  router.get('/:id/$delete-impact', async (req, res) => {
    const id = String(req.params.id ?? '');
    const existing = await service.get(id);
    if (!existing) throw new NotFoundError(metadata.name, id);

    const subject = securityContext(req);

    /*
     * Delete-impact is a preflight, not the mutation itself. A caller who may
     * read the record is allowed to discover whether deletion is available,
     * but relationship details are withheld when row-level delete
     * authorization fails. This prevents an edit/view page from failing merely
     * because a normally delete-capable role is forbidden to delete THIS row
     * (for example an Admin viewing their own SysBOUser).
     *
     * DELETE still performs the authoritative assertCan('delete') again.
     */
    await authorization.assertCan('read', subject, metadata.key, existing);
    const authorized = await authorization.can('delete', subject, metadata.key, existing);

    if (!authorized) {
      sendQuery(res, {
        targetObjectKey: metadata.key,
        targetId: id,
        authorized: false,
        canExecute: false,
        requiresConfirmation: false,
        impacts: [],
      });
      return;
    }

    sendQuery(res, {
      authorized: true,
      ...service.deleteImpact(id),
    });
  });

  /**
   * Delete one BO entry.
   */
  router.delete(
    '/:id',

    async (req, res) => {
      const id = String(req.params.id ?? '');

      await operationContext.runRoot(
        `Delete ${metadata.name}`,

        async (scope) => {
          const subject = securityContext(req);

          const existing = await service.get(id);

          if (!existing) {
            throw new NotFoundError(metadata.name, id);
          }

          await authorization.assertCan('delete', subject, metadata.key, existing);

          const actor = authenticatedAuditActor(subject.userId, subject.userName);

          scope.addContext({
            id,
            deletedBy: actor.userName,
          });

          await service.delete(id, actor);

          sendCommand(res, `${metadata.name} '${existing.name}' deleted successfully.`, { id });
        },
      );
    },
  );

  return router;
}

/**
 * Converts an internal persisted entity into an API-safe representation.
 *
 * Sensitive metadata fields, such as SysBOUser.passwordHash, are never
 * returned to API callers.
 *
 * SysBOUser exposes only:
 *
 *   hasPassword: boolean
 *
 * rather than the hash itself.
 */
function sanitize<T extends SysBOEntity>(
  item: T,
  metadata: SysBOMetadata<T>,
): Record<string, unknown> {
  const source = item as unknown as Record<string, unknown>;

  const result: Record<string, unknown> = {};

  const fields = Object.values(metadata.fieldDefinition).sort(
    (left, right) => left.order - right.order,
  );

  for (const field of fields) {
    if (field.sensitive) {
      continue;
    }

    result[field.key] = source[field.key];
  }

  /*
   * Password existence is useful account information,
   * whereas passwordHash is security-sensitive internal data.
   */
  if (metadata.key === 'sys-users') {
    result.hasPassword = Boolean(source.passwordHash);
  }

  if (metadata.key === 'sys-ext-auth-providers') {
    const hasClientSecret = Boolean(source.clientSecretEncrypted);
    result.hasClientSecret = hasClientSecret;
  }

  return result;
}

/**
 * Return the authenticated API subject attached by
 * requireAuthenticated middleware.
 */
function securityContext(req: Request) {
  if (!req.auth) {
    throw new AuthenticationError();
  }

  return req.auth;
}
