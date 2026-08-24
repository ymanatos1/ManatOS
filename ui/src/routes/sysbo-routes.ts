import { Router, type Request } from 'express';

import createError from 'http-errors';

import { AppError, operationContext, SysUserRole, type SysUser } from '@manatos/shared';

import { apiClient } from '../api-client.js';

import { config } from '../config.js';

import { apiSessionOptions } from '../auth/api-session.js';

import { requireSignedIn } from '../middleware/auth.js';

import { requireCsrf } from '../middleware/csrf.js';

import { renderPage } from '../render.js';

import { addSessionError } from '../errors/session-error-log.js';

import { getSysBODefinition } from '../sysbo/definitions.js';

import type { SysBODefinition } from '../sysbo/types.js';

const pathByKey: Record<string, string> = {
  'sys-users': 'SysUsers',

  'sys-principals': 'SysPrincipals',

  'sys-applications': 'SysApplications',

  'sys-licenses': 'SysLicenses',
};

/**
 * Current generic SysBO list payload.
 */
interface SysBOListData<T> {
  items: T[];

  paging: {
    total: number;

    page: number;

    pageSize: number;

    totalPages: number;
  };

  metadata?: unknown;
}

/**
 * Generic metadata-driven SysBO administration routes.
 */
export function createSysBORoutes() {
  const router = Router();

  /**
   * SysBO pages require authentication. Role/action permission is checked
   * per route below. The API remains the ultimate authorization boundary.
   */
  router.use(requireSignedIn);

  /**
   * List one SysBO.
   */
  router.get(
    '/:key',

    async (req, res, next) => {
      try {
        const key = routeParam(req.params.key);

        const definition = getSysBODefinition(key);
        const permissions = uiPermissions(res.locals.currentUser as SysUser | null, definition);
        requirePermission(permissions.view, 'Read access is required for this entity.');

        const apiPath = apiPathFor(definition.key);

        const query = listQuery(req, definition);

        const response = await apiClient.get<SysBOListData<Record<string, unknown>>>(
          `/api/v1/${apiPath}?${query}`,

          apiSessionOptions(req),
        );

        let hasAnyEntries = response.data.paging.total > 0;
        const filtersActive = hasActiveFilters(req, definition);

        // If a filtered result is empty, distinguish "entity is empty" from
        // "entries exist but none match the current filters".
        if (!hasAnyEntries && filtersActive) {
          const unfiltered = await apiClient.get<SysBOListData<Record<string, unknown>>>(
            `/api/v1/${apiPath}?page=1&pageSize=1`,
            apiSessionOptions(req),
          );

          hasAnyEntries = unfiltered.data.paging.total > 0;
        }

        await renderPage(
          res,
          'pages/bo-list',

          {
            title: definition.uiMetadata.listViewModel.title,
            titleIcon: definition.uiMetadata.icon,

            definition,
            permissions,
            hasAnyEntries,

            items: response.data.items,

            paging: response.data.paging,

            query: req.query,
          },
        );
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Display create form.
   */
  router.get(
    '/:key/new',

    async (req, res, next) => {
      try {
        const definition = getSysBODefinition(routeParam(req.params.key));
        const permissions = uiPermissions(res.locals.currentUser as SysUser | null, definition);
        requirePermission(permissions.create, 'Create access is required for this entity.');

        await renderPage(
          res,
          'pages/bo-edit',

          {
            title: definition.uiMetadata.editViewModel.createTitle,
            titleIcon: definition.uiMetadata.icon,

            definition,
            permissions,

            item: {},

            isNew: true,

            referenceData: await references(req, definition),
          },
        );
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Display edit form.
   */
  router.get(
    '/:key/:id',

    async (req, res, next) => {
      try {
        const key = routeParam(req.params.key);

        const id = routeParam(req.params.id);

        const definition = getSysBODefinition(key);
        const permissions = uiPermissions(res.locals.currentUser as SysUser | null, definition);
        requirePermission(permissions.view, 'Read access is required for this entity.');

        const apiPath = apiPathFor(definition.key);

        const item = (
          await apiClient.get<Record<string, unknown>>(
            `/api/v1/${apiPath}/${id}`,

            apiSessionOptions(req),
          )
        ).data;

        await renderPage(
          res,
          'pages/bo-edit',

          {
            title: permissions.edit
              ? definition.uiMetadata.editViewModel.editTitle
              : definition.uiMetadata.editViewModel.editTitle.replace(/^Edit\b/, 'View'),
            titleIcon: definition.uiMetadata.icon,

            definition,
            permissions,

            item,

            isNew: false,

            referenceData: await references(req, definition),
          },
        );
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Allow an Admin to explicitly verify another SysUser email address.
   *
   * This is intentionally a dedicated command instead of being folded into
   * the generic SysUser edit payload. It prevents an ordinary edit/save from
   * silently changing verification state.
   */
  router.post(
    '/sys-users/:id/verify-email',

    requireCsrf,

    async (req, res, next) => {
      try {
        if (!config.ALLOW_ADMIN_EMAIL_VERIFICATION) {
          throw new AppError(
            'FORBIDDEN',
            'Administrative email verification is disabled by UI configuration.',
            'Administrative email verification is disabled.',
            false,
          );
        }

        const id = routeParam(req.params.id);

        const currentUser = res.locals.currentUser as
          | import('@manatos/shared').SysUser
          | null;

        if (!currentUser || currentUser.role !== SysUserRole.Admin || currentUser.id === id) {
          throw new AppError(
            'FORBIDDEN',
            'An Admin may use this command only for another SysUser.',
            'You can verify another user account only.',
            false,
          );
        }

        await operationContext.runRoot(
          'Verify SysUser email administratively',

          async (scope) => {
            scope.addContext({
              userId: id,

              actorUserId: currentUser.id,
            });

            await apiClient.put(
              `/api/v1/internal/SysUsers/${id}/email-verified`,

              undefined,

              {
                internal: true,
              },
            );
          },
        );

        res.redirect(`/bo/sys-users/${id}?message=email-verified`);
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Create or update one SysBO entry.
   */
  router.post(
    '/:key/save',

    requireCsrf,

    async (req, res, next) => {
      const definition = getSysBODefinition(routeParam(req.params.key));

      const apiPath = apiPathFor(definition.key);

      const id = String(req.body.id ?? '');
      const permissions = uiPermissions(res.locals.currentUser as SysUser | null, definition);

      try {
        requirePermission(
          id ? permissions.edit : permissions.create,
          id ? 'Edit access is required for this entity.' : 'Create access is required for this entity.',
        );
        await operationContext.runRoot(
          `${id ? 'Update' : 'Create'} ${definition.boMetadata.name}`,

          async (scope) => {
            scope.addContext({
              id,

              name: req.body.name,
            });

            const payload = formPayload(req.body, definition);

            if (id) {
              await apiClient.patch(
                `/api/v1/${apiPath}/${id}`,

                payload,

                apiSessionOptions(req),
              );
            } else {
              await apiClient.post(
                `/api/v1/${apiPath}`,

                payload,

                apiSessionOptions(req),
              );
            }

            res.redirect(`/bo/${definition.key}`);
          },

          `Saving ${definition.boMetadata.name}`,
        );
      } catch (error) {
        /**
         * Session expiration should be handled centrally rather than being
         * converted into a normal edit-form application popup.
         */
        if (error instanceof AppError && error.code === 'UI_API_SESSION_EXPIRED') {
          next(error);

          return;
        }

        const appError =
          error instanceof AppError
            ? error
            : new AppError(
                'UNEXPECTED_ERROR',

                String(error),

                'The entry could not be saved.',

                true,
              );

        addSessionError(req, appError);

        await renderPage(
          res,
          'pages/bo-edit',

          {
            title: id
              ? definition.uiMetadata.editViewModel.editTitle
              : definition.uiMetadata.editViewModel.createTitle,
            titleIcon: definition.uiMetadata.icon,

            definition,
            permissions,

            item: {
              ...req.body,
              id,
            },

            isNew: !id,

            referenceData: await references(req, definition),

            applicationError: appError,
          },
        );
      }
    },
  );

  /**
   * Delete one SysBO entry.
   */
  router.post(
    '/:key/:id/delete',

    requireCsrf,

    async (req, res, next) => {
      try {
        const key = routeParam(req.params.key);

        const id = routeParam(req.params.id);

        const definition = getSysBODefinition(key);
        const permissions = uiPermissions(res.locals.currentUser as SysUser | null, definition);
        requirePermission(permissions.delete, 'Delete access is required for this entity.');

        const apiPath = apiPathFor(definition.key);

        await operationContext.runRoot(
          `Delete ${definition.boMetadata.name}`,

          async () => {
            await apiClient.delete(
              `/api/v1/${apiPath}/${id}`,

              apiSessionOptions(req),
            );
          },
        );

        res.redirect(`/bo/${definition.key}`);
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Open the future SysApplication playground.
   */
  router.get(
    '/sys-applications/:id/play',

    async (req, res, next) => {
      try {
        const id = routeParam(req.params.id);

        const definition = getSysBODefinition('sys-applications');
        const permissions = uiPermissions(res.locals.currentUser as SysUser | null, definition);
        requirePermission(permissions.view, 'Read access is required for applications.');

        req.session.activeApplicationId = id;

        const application = (
          await apiClient.get<Record<string, unknown>>(
            `/api/v1/SysApplications/${id}`,

            apiSessionOptions(req),
          )
        ).data;

        await renderPage(
          res,
          'pages/application-playground',

          {
            title: `${String(application.name)} Playground`,

            application,
          },
        );
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

interface UIEntityPermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

function uiPermissions(user: SysUser | null, definition: SysBODefinition): UIEntityPermissions {
  const role = user?.role;
  const allowed = (roles: SysUserRole[]) => Boolean(role && roles.includes(role));

  return {
    view: allowed(definition.permissions.view),
    create: allowed(definition.permissions.create),
    edit: allowed(definition.permissions.edit),
    delete: allowed(definition.permissions.delete),
  };
}

function requirePermission(allowed: boolean, message: string): void {
  if (!allowed) {
    throw createError(403, message);
  }
}

function hasActiveFilters(req: Request, definition: SysBODefinition): boolean {
  return definition.uiMetadata.filterDefinition.fields.some((field) => {
    const value = req.query[`filter.${field}`];
    return typeof value === 'string' && value.length > 0;
  });
}

/**
 * Build list query parameters from the current UI request.
 */
function listQuery(
  req: Request,

  definition: SysBODefinition,
): string {
  const params = new URLSearchParams();

  params.set(
    'page',

    String(req.query.page ?? 1),
  );

  params.set(
    'pageSize',

    String(req.query.pageSize ?? definition.uiMetadata.paginationConfiguration.defaultPageSize),
  );

  if (typeof req.query.sort === 'string') {
    params.set('sort', req.query.sort);
  }

  if (req.query.direction === 'desc') {
    params.set('direction', 'desc');
  }

  for (const field of definition.uiMetadata.filterDefinition.fields) {
    const value = req.query[`filter.${field}`];

    if (typeof value === 'string' && value) {
      params.set(`filter.${field}`, value);
    }
  }

  return params.toString();
}

/**
 * Convert posted form values into UI-neutral SysBO data.
 */
function formPayload(
  body: Record<string, unknown>,

  definition: SysBODefinition,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const field of Object.values(definition.boMetadata.fieldDefinition)) {
    if (field.generated || field.readOnly || field.sensitive) {
      continue;
    }

    /**
     * SysUser email verification is an explicit security command in the UI,
     * not a normal editable boolean. Omitting it here prevents an ordinary
     * Save from accidentally verifying or un-verifying an account.
     */
    if (definition.key === 'sys-users' && field.key === 'emailVerified') {
      continue;
    }

    const raw = body[field.key];

    if (field.type === 'boolean') {
      output[field.key] = raw === 'on' || raw === 'true' || raw === true;
    } else if (field.type === 'number') {
      output[field.key] = Number(raw ?? 0);
    } else if (raw !== undefined && raw !== '') {
      output[field.key] = raw;
    } else if (field.nullable) {
      output[field.key] = null;
    }
  }

  return output;
}

/**
 * Load referenced BO values used by reference/select controls.
 */
async function references(
  req: Request,

  definition: SysBODefinition,
): Promise<Record<string, unknown[]>> {
  const output: Record<string, unknown[]> = {};

  for (const field of Object.values(definition.boMetadata.fieldDefinition)) {
    if (!field.referenceBOKey) {
      continue;
    }

    const apiPath = pathByKey[field.referenceBOKey];

    if (!apiPath) {
      continue;
    }

    const response = await apiClient.get<SysBOListData<unknown>>(
      `/api/v1/${apiPath}?pageSize=500&sort=name`,

      apiSessionOptions(req),
    );

    output[field.key] = response.data.items;
  }

  return output;
}

/**
 * Resolve one configured API resource name.
 */
function apiPathFor(key: string): string {
  const apiPath = pathByKey[key];

  if (!apiPath) {
    throw new Error(`No API path is configured for SysBO '${key}'.`);
  }

  return apiPath;
}

/**
 * Normalize Express 5 route parameters at the HTTP boundary.
 */
function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}
