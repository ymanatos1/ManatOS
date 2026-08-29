import { Router, type Request, type RequestHandler } from 'express';

import {
  AuthenticationError,
  ForbiddenAppError,
  SysBOUserRole,
  NotFoundError,
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
  router.get('/$metadata', (_req, res) => {
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
  router.get('/$metadata-ui', (_req, res) => {
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

        const result = await service.list(parseListQuery(req));

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
