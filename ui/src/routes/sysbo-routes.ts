import { randomUUID } from 'node:crypto';

import { Router, type Request } from 'express';

import createError from 'http-errors';

import {
  AppError,
  operationContext,
  SysUserRole,
  type ExternalProviderKey,
  type SysUser,
} from '@manatos/shared';

import { apiClient } from '../api-client.js';

import { config } from '../config.js';

import { apiSessionOptions } from '../auth/api-session.js';

import { requireSignedIn } from '../middleware/auth.js';

import { requireCsrf } from '../middleware/csrf.js';

import { renderPage } from '../render.js';

import { addSessionError } from '../errors/session-error-log.js';

import { getSysBODefinition } from '../sysbo/definitions.js';

import type { SysBODefinition, SysBOEditTabDefinition } from '../sysbo/types.js';

import { externalIdentitiesForUser } from '../auth/user-authentication.js';
import { refreshExternalProviderRegistry } from '../auth/external-providers.js';
import { configurePassport } from '../auth/passport.js';

interface ExternalAuthProviderDefinition {
  provider: string;
  label: string;
  icon: string;
  scope: string[];
  callbackPath: string;
  tenant?: string;
  generalHelp: {
    title: string;
    steps: string[];
    configuredRule: string;
  };
  secretsHelp: {
    title: string;
    introduction: string;
    clientId: string[];
    clientSecret: string[];
    warning?: string;
  };
}

const pathByKey: Record<string, string> = {
  'sys-users': 'SysUsers',

  'sys-principals': 'SysPrincipals',

  'sys-applications': 'SysApplications',

  'sys-licenses': 'SysLicenses',

  'sys-ext-auth-providers': 'SysExtAuthProviders',
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

        if (key === 'sys-ext-auth-providers') {
          delete req.session.pendingExtAuthCredentialTest;
        }

        const definition = getSysBODefinition(key);

        const currentUser = res.locals.currentUser as SysUser | null;

        const permissions = uiPermissions(currentUser, definition);
        requirePermission(permissions.view, 'Read access is required for this entity.');

        const apiPath = apiPathFor(definition.key);

        const query = listQuery(req, definition);

        const response = await apiClient.get<SysBOListData<Record<string, unknown>>>(
          `/api/v1/${apiPath}?${query}`,

          apiSessionOptions(req),
        );

        let hasAnyEntries = response.data.paging.total > 0;
        let allExternalProvidersConfigured = false;
        if (definition.key === 'sys-ext-auth-providers') {
          const defs = (await apiClient.get<{ providers: ExternalAuthProviderDefinition[] }>('/api/v1/SysExtAuthProviders/definitions', apiSessionOptions(req))).data.providers;
          allExternalProvidersConfigured = response.data.paging.total >= defs.length;
        }
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
            allExternalProvidersConfigured,

            items: response.data.items,

            paging: response.data.paging,

            query: {
              ...req.query,

              /**
               * Keep the effective page size in the rendered query model even
               * when it came from the current ManatOS UI session rather than
               * explicitly from this request URL.
               *
               * This makes paging/sorting links and the Rows selector preserve
               * the same session-wide selection consistently.
               */
              pageSize: String(response.data.paging.pageSize),
            },
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

            ...(await editPageSupplementalData(
              req,
              definition,
              res.locals.currentUser as SysUser | null,
              {},
              true,
            )),
            ...credentialTestResultPresentation(req),
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

        const currentUser = res.locals.currentUser as SysUser | null;

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

            ...(await editPageSupplementalData(req, definition, currentUser, item, false)),
            ...credentialTestResultPresentation(req),
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

        const currentUser = res.locals.currentUser as import('@manatos/shared').SysUser | null;

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
   * Start an end-to-end OAuth test for a proposed Client ID + Client secret.
   * The plaintext secret remains only in the server-side Express session until
   * the provider callback either verifies it or rejects it.
   */
  router.post('/sys-ext-auth-providers/test-credentials', requireCsrf, async (req, res, next) => {
    try {
      const definition = getSysBODefinition('sys-ext-auth-providers');
      const currentUser = res.locals.currentUser as SysUser | null;
      const permissions = uiPermissions(currentUser, definition);
      requirePermission(permissions.edit || permissions.create, 'Admin access is required to test provider credentials.');

      const provider = String(req.body.provider ?? '').trim().toLowerCase() as ExternalProviderKey;
      const clientId = String(req.body.clientId ?? '').trim();
      const clientSecret = String(req.body.clientSecret ?? '').trim();
      const recordId = String(req.body.id ?? '').trim();

      if (!clientId || !clientSecret) {
        res.status(400).json({
          success: false,
          errorMessage: 'Enter both Client ID and Client secret before testing.',
        });
        return;
      }

      const definitions = (
        await apiClient.get<{ providers: ExternalAuthProviderDefinition[] }>(
          '/api/v1/SysExtAuthProviders/definitions',
          apiSessionOptions(req),
        )
      ).data.providers;
      const providerDefinition = definitions.find((item) => item.provider === provider);

      if (!providerDefinition) {
        throw new AppError('VALIDATION_ERROR', 'Unsupported external authentication provider.', 'Choose a supported provider.');
      }

      req.session.pendingExtAuthCredentialTest = {
        testId: randomUUID(),
        ...(recordId ? { recordId } : {}),
        provider,
        enabled: req.body.enabled === 'on' || req.body.enabled === 'true' || req.body.enabled === true,
        clientId,
        clientSecret,
        scope: providerDefinition.scope,
        callbackPath: providerDefinition.callbackPath,
        ...(providerDefinition.tenant ? { tenant: providerDefinition.tenant } : {}),
        returnPath: recordId
          ? `/bo/sys-ext-auth-providers/${encodeURIComponent(recordId)}`
          : '/bo/sys-ext-auth-providers/new',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      // The browser starts the OAuth navigation only after the draft has
      // been captured successfully in the server-side session. Returning JSON
      // keeps validation/API failures on the edit page instead of throwing the
      // Admin back to Home and losing the unsaved form.
      res.json({
        success: true,
        testId: req.session.pendingExtAuthCredentialTest.testId,
        redirectUrl: `/auth/${provider}/test-credentials`,
        statusUrl: `/bo/sys-ext-auth-providers/test-credentials/status?testId=${encodeURIComponent(req.session.pendingExtAuthCredentialTest.testId)}`,
        cancelUrl: '/bo/sys-ext-auth-providers/test-credentials/cancel',
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Report the authoritative state of the current provider credential test.
   *
   * The main Admin editor polls this same-session endpoint while the provider
   * OAuth popup is open. Correctness therefore does not depend on
   * window.opener/postMessage surviving a cross-origin OAuth round trip.
   */
  router.get('/sys-ext-auth-providers/test-credentials/status', async (req, res, next) => {
    try {
      const definition = getSysBODefinition('sys-ext-auth-providers');
      const currentUser = res.locals.currentUser as SysUser | null;
      const permissions = uiPermissions(currentUser, definition);
      requirePermission(permissions.edit || permissions.create, 'Admin access is required to inspect provider credential tests.');

      const requestedTestId = String(req.query.testId ?? '');
      const pending = req.session.pendingExtAuthCredentialTest;

      if (!pending || pending.testId !== requestedTestId) {
        res.status(404).json({ success: false, status: 'missing', message: 'The provider credential test is no longer available.' });
        return;
      }

      const expired = Date.now() - Date.parse(pending.createdAt) > 10 * 60 * 1000;
      if (expired && pending.status === 'pending') {
        pending.status = 'failed';
        pending.errorMessage = 'The provider credential test expired before completion.';
        delete pending.clientSecret;
      }

      res.set('Cache-Control', 'no-store');
      res.json({
        success: true,
        testId: pending.testId,
        provider: pending.provider,
        status: pending.status,
        message: pending.status === 'verified'
          ? 'Provider credentials tested successfully. They are ready to save.'
          : pending.status === 'failed'
            ? (pending.errorMessage ?? 'The provider rejected the proposed credentials.')
            : 'Waiting for the provider credential test to complete.',
        ...(pending.verifiedAt ? { verifiedAt: pending.verifiedAt } : {}),
      });
    } catch (error) {
      next(error);
    }
  });
  router.post('/sys-ext-auth-providers/test-credentials/cancel', requireCsrf, async (req, res) => {
    const requestedTestId = String(req.body.testId ?? '');
    const pending = req.session.pendingExtAuthCredentialTest;
    if (pending && pending.testId === requestedTestId) {
      delete req.session.pendingExtAuthCredentialTest;
    }
    res.json({ success:true, status:'cancelled' });
  });

  /** Remove the complete provider credential pair and disable the provider. */
  router.post('/sys-ext-auth-providers/:id/remove-credentials', requireCsrf, async (req, res, next) => {
    try {
      const definition = getSysBODefinition('sys-ext-auth-providers');
      const currentUser = res.locals.currentUser as SysUser | null;
      const permissions = uiPermissions(currentUser, definition);
      requirePermission(permissions.edit, 'Edit access is required for external authentication providers.');
      const id = routeParam(req.params.id);

      await apiClient.delete(
        `/api/v1/internal/external-auth-providers/${id}/credentials`,
        { ...apiSessionOptions(req), internal: true },
      );

      delete req.session.pendingExtAuthCredentialTest;
      await refreshExternalProviderRegistry();
      configurePassport();
      res.redirect(`/bo/sys-ext-auth-providers/${id}`);
    } catch (error) {
      next(error);
    }
  });

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
          id
            ? 'Edit access is required for this entity.'
            : 'Create access is required for this entity.',
        );

        if (definition.key === 'sys-ext-auth-providers') {
          const pending = req.session.pendingExtAuthCredentialTest;
          const provider = String(req.body.provider ?? '').trim().toLowerCase();
          const pendingMatches =
            pending?.status === 'verified' &&
            pending.provider === provider &&
            (pending.recordId ?? '') === id &&
            Boolean(pending.clientSecret) &&
            Date.now() - Date.parse(pending.createdAt) <= 10 * 60 * 1000;

          if (pendingMatches) {
            await apiClient.post(
              '/api/v1/internal/external-auth-providers/verified-credentials',
              {
                ...(id ? { id } : {}),
                provider,
                enabled: req.body.enabled === 'on' || req.body.enabled === 'true' || req.body.enabled === true,
                clientId: pending.clientId,
                clientSecret: pending.clientSecret,
                callbackPath: req.body.callbackPath,
                ...(req.body.tenant ? { tenant: req.body.tenant } : {}),
              },
              { ...apiSessionOptions(req), internal: true },
            );

            delete req.session.pendingExtAuthCredentialTest;
            await refreshExternalProviderRegistry();
            configurePassport();
            res.redirect('/bo/sys-ext-auth-providers');
            return;
          }
        }

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

            if (definition.key === 'sys-ext-auth-providers') {
              await refreshExternalProviderRegistry();
              configurePassport();
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

            ...(await editPageSupplementalData(
              req,
              definition,
              res.locals.currentUser as SysUser | null,
              {
                ...req.body,
                id,
              },
              !id,
            )),

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

        const currentUser = res.locals.currentUser as SysUser | null;
        const permissions = uiPermissions(currentUser, definition);
        requirePermission(permissions.delete, 'Delete access is required for this entity.');

        if (definition.key === 'sys-users' && currentUser && id === currentUser.id) {
          throw new AppError(
            'FORBIDDEN',
            'A SysUser cannot delete its own account.',
            'You cannot delete your own user account.',
            false,
          );
        }

        const apiPath = apiPathFor(definition.key);

        await operationContext.runRoot(
          `Delete ${definition.boMetadata.name}`,

          async () => {
            await apiClient.delete(
              `/api/v1/${apiPath}/${id}`,

              apiSessionOptions(req),
            );

            if (definition.key === 'sys-ext-auth-providers') {
              await refreshExternalProviderRegistry();
              configurePassport();
            }
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

/**
 * Build the shared data required by the generic SysBO edit/review page.
 *
 * Keeping this in one place is important because bo-edit.ejs is rendered
 * from several paths: create, edit/view, and save-error redisplay. Every
 * path must receive the same tab, authentication, and reference-data
 * contract.
 */
async function editPageSupplementalData(
  req: Request,
  definition: SysBODefinition,
  currentUser: SysUser | null,
  item: Record<string, unknown>,
  isNew: boolean,
) {
  const tabs = visibleEditTabs(definition, currentUser, isNew);

  const showAuthenticationTab = tabs.some((tab) => tab.id === 'authentication');

  const itemId = typeof item.id === 'string' ? item.id : '';

  const authenticationIdentities =
    definition.key === 'sys-users' && !isNew && showAuthenticationTab && itemId
      ? await externalIdentitiesForUser(itemId)
      : [];

  let externalAuthProviderDefinitions = definition.key === 'sys-ext-auth-providers'
    ? (await apiClient.get<{ providers: ExternalAuthProviderDefinition[] }>('/api/v1/SysExtAuthProviders/definitions', apiSessionOptions(req))).data.providers
    : [];
  let suggestedProvider = '';
  if (definition.key === 'sys-ext-auth-providers' && isNew) {
    const configured = (await apiClient.get<SysBOListData<Record<string, unknown>>>('/api/v1/SysExtAuthProviders?page=1&pageSize=100', apiSessionOptions(req))).data.items;
    const configuredKeys = new Set(configured.map((entry) => String(entry.provider ?? '').toLowerCase()));
    externalAuthProviderDefinitions = externalAuthProviderDefinitions.filter((entry) => !configuredKeys.has(entry.provider));
    suggestedProvider = externalAuthProviderDefinitions[0]?.provider ?? '';
  }

  const rawPrimaryValue = item[definition.boMetadata.primaryField];
  let displayValue = String(rawPrimaryValue ?? 'entry');
  if (definition.key === 'sys-ext-auth-providers') {
    const providerDefinition = externalAuthProviderDefinitions.find(
      (candidate) => candidate.provider === String(rawPrimaryValue ?? '').toLowerCase(),
    );
    displayValue = providerDefinition?.label ?? displayValue.replace(/^./, (character) => character.toUpperCase());
  }

  return {
    tabs,
    authenticationIdentities,
    referenceData: await references(req, definition),
    deletePresentation: {
      displayValue,
      entityLabel:
        definition.uiMetadata.editViewModel.deleteEntityLabel ??
        definition.uiMetadata.editViewModel.editTitle.replace(/^Edit\s+/i, ''),
    },

    // Provider defaults/help are API-owned reference metadata. Admin pages
    // request them through the authenticated API so create, edit/view and
    // save-error redisplay all use the same provider definitions.
    ...(definition.key === 'sys-ext-auth-providers'
      ? {
          externalAuthProviderDefinitions,
          suggestedProvider,
          credentialTest: credentialTestForPage(req, item, isNew),
        }
      : {}),
  };
}

/** Present the completed credential test through the standard ManatOS message popup. */
function credentialTestResultPresentation(req: Request) {
  const result = String(req.query.credentialsTest ?? '');
  if (result === 'verified') {
    return {
      informationTitle: 'Credentials verified',
      informationMessage: 'The provider accepted the Client ID and Client secret. The verified credential pair is ready to save.',
    };
  }
  if (result === 'failed') {
    return {
      warningTitle: 'Credential verification failed',
      warningMessage:
        req.session.pendingExtAuthCredentialTest?.errorMessage ??
        'The provider rejected the proposed credentials. Review the values on the Secrets tab and test them again.',
    };
  }
  return {};
}

/**
 * Resolve the tabs visible to the current website role.
 *
 * visible:
 *   omitted/true  -> visible (default)
 *   false         -> hidden
 *   { roles: [] } -> visible only to one of the listed roles
 *
 * Authentication is meaningful only for an existing SysUser, so it is
 * suppressed automatically on the create page.
 */
function credentialTestForPage(
  req: Request,
  item: Record<string, unknown>,
  isNew: boolean,
) {
  const pending = req.session.pendingExtAuthCredentialTest;
  if (!pending) return null;

  const itemId = typeof item.id === 'string' ? item.id : '';
  if ((pending.recordId ?? '') !== (isNew ? '' : itemId)) return null;

  return {
    provider: pending.provider,
    enabled: pending.enabled,
    clientId: pending.clientId,
    status: pending.status,
    verifiedAt: pending.verifiedAt,
    errorMessage: pending.errorMessage,
    hasPendingSecret: Boolean(pending.clientSecret),
  };
}

function visibleEditTabs(
  definition: SysBODefinition,
  user: SysUser | null,
  isNew: boolean,
): SysBOEditTabDefinition[] {
  const configuredTabs = definition.uiMetadata.editViewModel.tabs ?? [
    {
      id: 'general',
      title: 'General info',
      icon: 'bi-info-circle',
    },
  ];

  return configuredTabs.filter((tab) => {
    if (isNew && tab.id === 'authentication') {
      return false;
    }

    if (tab.visible === false) {
      return false;
    }

    if (tab.visible === undefined || tab.visible === true) {
      return true;
    }

    return Boolean(user && tab.visible.roles.includes(user.role));
  });
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

  const pagination = definition.uiMetadata.paginationConfiguration;
  const requestedPageSize = Number(req.query.pageSize);

  /**
   * Page size is a UI-session preference shared by every SysBO list.
   *
   * An explicit valid pageSize in the current request updates the session
   * preference. Requests that omit pageSize (for example Filter/Clear or
   * opening another entity list) reuse the current session preference.
   *
   * A newly authenticated ManatOS session has no stored value, so it starts
   * from the configured default page size.
   */
  if (pagination.allowedPageSizes.includes(requestedPageSize)) {
    req.session.uiPageSize = requestedPageSize;
  }

  const sessionPageSize = req.session.uiPageSize;
  const pageSize =
    typeof sessionPageSize === 'number' && pagination.allowedPageSizes.includes(sessionPageSize)
      ? sessionPageSize
      : pagination.defaultPageSize;

  params.set(
    'pageSize',

    String(pageSize),
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

  if (definition.key === 'sys-ext-auth-providers') {
    const clientSecret = String(body.clientSecret ?? '').trim();
    if (clientSecret) output.clientSecret = clientSecret;
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
