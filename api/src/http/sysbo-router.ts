import { Router, type RequestHandler } from 'express';

import {
  NotFoundError,
  operationContext,
  type SysBOEntity,
  type SysBOMetadata,
} from '@manatos/shared';

import type { GenericSysBOService } from '../services/generic-sysbo-service.js';
import { parseListQuery } from './query.js';

/**
 * Builds the standard REST CRUD router for a metadata-driven SysBO.
 *
 * Business-object metadata and actual business data remain separate.
 *
 * Metadata is returned:
 *
 *   GET /$metadata
 *
 * or optionally alongside a list when:
 *
 *   ?includeMetadata=true
 *
 * Normal CRUD responses return data only.
 */
export function createSysBORouter<T extends SysBOEntity>(
  service: GenericSysBOService<T>,
  metadata: SysBOMetadata<T>,

  /**
   * Optional entity-specific creation hook.
   *
   * SysUser uses this because creation may involve password hashing
   * and other account-specific processing before persistence.
   */
  customCreate?: (body: Record<string, unknown>) => Promise<T>,
): Router {
  const router = Router();

  /**
   * Return the hard-coded, UI-neutral BO metadata.
   */
  router.get('/$metadata', (_req, res) => {
    res.json({
      metadata,
    });
  });

  /**
   * List entries with filtering, sorting and pagination.
   */
  router.get('/', async (req, res) => {
    await operationContext.runRoot(
      `List ${metadata.pluralName}`,

      async () => {
        const result = await service.list(parseListQuery(req));

        const includeMetadata = req.query.includeMetadata === 'true';

        res.json({
          ...(includeMetadata ? { metadata } : {}),

          data: result.items.map((item) => sanitize(item, metadata)),

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
  router.get(
    '/:id',

    async (req, res) => {
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

          res.json({
            data: sanitize(item, metadata),
          });
        },
      );
    },
  );

  /**
   * Create one BO entry.
   */
  const createHandler: RequestHandler = async (req, res) => {
    await operationContext.runRoot(
      `Create ${metadata.name}`,

      async (scope) => {
        scope.comment('name', req.body?.name);

        /*
         * Some BOs need specialized creation logic.
         *
         * For example, SysUser creation hashes a supplied password
         * before persistence.
         */
        const item = customCreate
          ? await customCreate(req.body ?? {})
          : await service.create(req.body);

        res.status(201).json({
          data: sanitize(item, metadata),
        });
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
        scope.addContext({
          id,
          name: req.body?.name,
        });

        const item = await service.update(id, req.body);

        res.json({
          data: sanitize(item, metadata),
        });
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
          scope.comment('id', id);

          await service.delete(id);

          res.status(204).end();
        },
      );
    },
  );

  return router;
}

/**
 * Converts an internal persisted entity into an API-safe representation.
 *
 * Sensitive metadata fields, such as SysUser.passwordHash, are never
 * returned to API callers.
 *
 * SysUser exposes only:
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

  return result;
}
