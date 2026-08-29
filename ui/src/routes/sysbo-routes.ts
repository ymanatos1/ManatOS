import { randomUUID } from 'node:crypto';

import { Router, type Request, type Response } from 'express';

import createError from 'http-errors';

import {
  AppError,
  operationContext,
  SysBOUserRole,
  type ExternalProviderKey,
  type SysBOMetadata,
  type SysBOUIMetadata,
  type SysBOUser,
  calculatedContextField,
  type ManatOSContext,
} from '@manatos/shared';

import { apiClient } from '../api-client.js';

import { config } from '../config.js';

import { apiSessionOptions } from '../auth/api-session.js';

import { requireSignedIn } from '../middleware/auth.js';

import { requireCsrf } from '../middleware/csrf.js';

import { renderPage } from '../render.js';

import { uiBootstrapState } from '../bootstrap/ui-bootstrap.js';

import { addSessionError } from '../errors/session-error-log.js';

import { getSysBODefinition } from '../sysbo/definitions.js';

import type { SysBODefinition, SysBOEditTabDefinition } from '../sysbo/types.js';

import { externalIdentitiesForUser } from '../auth/user-authentication.js';
import { refreshExternalProviderRegistry } from '../auth/external-providers.js';
import { configurePassport } from '../auth/passport.js';
import {
  contextFields,
  entityContextName,
  pageContextNode,
  registerContextEntity,
  setPageContext,
} from '../context/manatos-context.js';

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
type SysBOUiImplementation = 'current' | 'metadata';

const CURRENT_SYSBO_UI: SysBOUiImplementation = 'current';
const METADATA_SYSBO_UI: SysBOUiImplementation = 'metadata';

/**
 * Temporary persisted #16 selector settings. These live in SysConfiguration so
 * the comparison choice survives browser/server-session changes while the
 * migration is in progress. Remove the settings and this map when #16 closes.
 */
const sysBOUiViewModeConfigurationNameByKey: Readonly<Record<string, string>> = {
  'sys-users': 'UI_SYSBO_USERS_VIEW_MODE',
  'sys-principals': 'UI_SYSBO_PRINCIPALS_VIEW_MODE',
  'sys-applications': 'UI_SYSBO_APPLICATIONS_VIEW_MODE',
  'sys-licenses': 'UI_SYSBO_LICENSES_VIEW_MODE',
  'sys-ext-auth-providers': 'UI_SYSBO_EXT_AUTH_PROVIDERS_VIEW_MODE',
};

interface SysBOUiViewModeConfigurationItem {
  id: string;
  name: string;
  value: string | null;
}

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
 * Attach a SysBO list page as the root of the active logical page branch.
 *
 * Canonical BO/UI metadata is registered once under ctx.entities. The page
 * keeps only runtime state that is specific to this list instance.
 */
function applySysBOListContext(
  res: Response,
  definition: SysBODefinition,
  values: Readonly<Record<string, unknown>>,
) {
  const ctx = res.locals.ctx as ManatOSContext;
  const { metadata, uiMetadata, ...pageValues } = values;

  registerContextEntity(
    ctx,
    definition.key,
    metadata ?? definition.boMetadata,
    uiMetadata ?? definition.uiMetadata,
  );

  const page = pageContextNode(
    entityContextName(definition.key),
    'sysbo-list',
    'list',
    contextFields({
      entity: entityContextName(definition.key),
      ...pageValues,
    }),
  );

  res.locals.ctx = setPageContext(ctx, page);
}

/**
 * Attach a SysBO entry page beneath its logical list page.
 *
 * The child does not repeat entity identity or canonical metadata: lexical
 * resolution can find `entity` in its parent list page and canonical metadata
 * is always addressable through ctx.entities.
 */
function applySysBOEntryContext(
  res: Response,
  definition: SysBODefinition,
  mode: string,
  entry: Record<string, unknown> | null,
  values: Readonly<Record<string, unknown>>,
) {
  const ctx = res.locals.ctx as ManatOSContext;
  const { metadata, uiMetadata, formValues, ...pageValues } = values;

  registerContextEntity(
    ctx,
    definition.key,
    metadata ?? definition.boMetadata,
    uiMetadata ?? definition.uiMetadata,
  );

  const runtimeEntryValues =
    formValues && typeof formValues === 'object' && !Array.isArray(formValues)
      ? (formValues as Record<string, unknown>)
      : entry ?? {};

  const entryFields = contextFields({
    ...runtimeEntryValues,
    ...pageValues,
  });

  /*
   * Expression-backed UI fields become real calculated CTX variables. Parsing
   * happens here, when the context variable is declared, while variable/path
   * resolution remains completely lazy and context-dependent at value access.
   */
  const canonical = (metadata ?? definition.boMetadata) as SysBOMetadata<Record<string, unknown>>;
  const ui = (uiMetadata ?? definition.uiMetadata) as SysBOUIMetadata | undefined;
  // API $metadata-ui is already the effective UI contract. Current-EJS paths
  // do not use that contract, so fall back to canonical derived fields there.
  const effectiveDerivedFields = ui?.record?.derivedFields ?? canonical.derivedFields ?? {};
  for (const [derivedName, derived] of Object.entries(effectiveDerivedFields)) {
    if (!derived.expression) continue;
    entryFields[derivedName] = calculatedContextField(derived.expression, {
      diagnosticSink: (diagnostic) => {
        console.error('[ManatOS expression parse]', diagnostic);
      },
    });
  }

  const entryPage = pageContextNode(
    'entry',
    'sysbo-entry',
    mode,
    entryFields,
  );

  const listPage = pageContextNode(
    entityContextName(definition.key),
    'sysbo-list',
    'list',
    contextFields({
      entity: entityContextName(definition.key),
    }),
    entryPage,
  );

  res.locals.ctx = setPageContext(ctx, listPage);
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
   * Temporary #16 migration switch between the current entity-specific EJS
   * implementation and the emerging shared metadata-driven SysBO UI engine.
   *
   * The choice is per SysBO and per authenticated browser session so the two
   * implementations can be compared repeatedly without changing persisted
   * application configuration. SysBOConfiguration is intentionally excluded.
   */
  router.post('/:key/ui-implementation', requireCsrf, async (req, res, next) => {
    try {
      const key = routeParam(req.params.key);
      const definition = getSysBODefinition(key);
      const currentUser = res.locals.currentUser as SysBOUser | null;

      requireSysBOUiMigrationAccess(currentUser, definition);

      const requested = String(req.body.implementation ?? '').trim();
      if (requested !== CURRENT_SYSBO_UI && requested !== METADATA_SYSBO_UI) {
        throw createError(400, 'Unknown SysBO UI implementation.');
      }

      await persistSysBOUiImplementation(req, definition, requested);

      res.redirect(safeSysBOReturnPath(req.body.returnPath, definition.key));
    } catch (error) {
      next(error);
    }
  });

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

        const currentUser = res.locals.currentUser as SysBOUser | null;

        const permissions = uiPermissions(currentUser, definition);
        requirePermission(permissions.view, 'Read access is required for this entity.');

        const uiImplementation = await sysBOUiImplementation(req, currentUser, definition);
        if (uiImplementation === METADATA_SYSBO_UI) {
          await renderMetadataDrivenListPlaceholder(req, res, definition, permissions);
          return;
        }

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

        applySysBOListContext(res, definition, {
          metadata: definition.boMetadata,
          uiMetadata: definition.uiMetadata,
          items: response.data.items,
          paging: response.data.paging,
          query: { ...req.query, pageSize: String(response.data.paging.pageSize) },
          permissions,
        });

        await renderPage(
          res,
          'pages/bo-list',

          {
            title: definition.uiMetadata.listViewModel.title,
            titleIcon: definition.uiMetadata.icon,

            definition,
            permissions,
            ...sysBOUiSelectorModel(req, currentUser, definition, CURRENT_SYSBO_UI),
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
        const currentUser = res.locals.currentUser as SysBOUser | null;
        const permissions = uiPermissions(currentUser, definition);
        requirePermission(permissions.create, 'Create access is required for this entity.');

        const uiImplementation = await sysBOUiImplementation(req, currentUser, definition);
        if (uiImplementation === METADATA_SYSBO_UI) {
          await renderMetadataDrivenRecordPlaceholder(req, res, definition, permissions, {
            isNew: true,
          });
          return;
        }

        const supplemental = await editPageSupplementalData(
          req,
          definition,
          currentUser,
          {},
          true,
        );

        applySysBOEntryContext(res, definition, 'create', null, {
          formValues: {},
          metadata: definition.boMetadata,
          uiMetadata: definition.uiMetadata,
          permissions,
          referenceData: supplemental.referenceData,
          externalIdentities: supplemental.relatedData.externalIdentities,
          activeTab: typeof req.query.tab === 'string' ? req.query.tab : null,
        });

        await renderPage(
          res,
          'pages/bo-edit',

          {
            title: definition.uiMetadata.editViewModel.createTitle,
            titleIcon: definition.uiMetadata.icon,

            definition,
            permissions,
            ...sysBOUiSelectorModel(req, currentUser, definition, CURRENT_SYSBO_UI),

            item: {},

            isNew: true,

            ...supplemental,
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
        const currentUser = res.locals.currentUser as SysBOUser | null;
        const permissions = uiPermissions(currentUser, definition);
        requirePermission(permissions.view, 'Read access is required for this entity.');

        const uiImplementation = await sysBOUiImplementation(req, currentUser, definition);
        if (uiImplementation === METADATA_SYSBO_UI) {
          await renderMetadataDrivenRecordPlaceholder(req, res, definition, permissions, {
            isNew: false,
            recordId: id,
          });
          return;
        }

        const apiPath = apiPathFor(definition.key);

        const item = (
          await apiClient.get<Record<string, unknown>>(
            `/api/v1/${apiPath}/${id}`,

            apiSessionOptions(req),
          )
        ).data;

        const supplemental = await editPageSupplementalData(
          req,
          definition,
          currentUser,
          item,
          false,
        );
        const recordMode = permissions.edit ? 'edit' : 'view';

        applySysBOEntryContext(res, definition, recordMode, item, {
          recordId: id,
          formValues: item,
          metadata: definition.boMetadata,
          uiMetadata: definition.uiMetadata,
          permissions,
          referenceData: supplemental.referenceData,
          externalIdentities: supplemental.relatedData.externalIdentities,
          activeTab: typeof req.query.tab === 'string' ? req.query.tab : null,
        });

        await renderPage(
          res,
          'pages/bo-edit',

          {
            title: `${permissions.edit
              ? definition.uiMetadata.editViewModel.editTitle
              : definition.uiMetadata.editViewModel.editTitle.replace(/^Edit\b/, 'View')} - ${supplemental.primaryDisplayValue}`,
            titleIcon: definition.uiMetadata.icon,

            definition,
            permissions,
            ...sysBOUiSelectorModel(req, currentUser, definition, CURRENT_SYSBO_UI),

            item,

            isNew: false,

            ...supplemental,
            ...credentialTestResultPresentation(req),
          },
        );
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Allow an Admin to explicitly verify another SysBOUser email address.
   *
   * This is intentionally a dedicated command instead of being folded into
   * the generic SysBOUser edit payload. It prevents an ordinary edit/save from
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

        const currentUser = res.locals.currentUser as import('@manatos/shared').SysBOUser | null;

        if (!currentUser || currentUser.role !== SysBOUserRole.Admin || currentUser.id === id) {
          throw new AppError(
            'FORBIDDEN',
            'An Admin may use this command only for another SysBOUser.',
            'You can verify another user account only.',
            false,
          );
        }

        await operationContext.runRoot(
          'Verify SysBOUser email administratively',

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
      const currentUser = res.locals.currentUser as SysBOUser | null;
      const permissions = uiPermissions(currentUser, definition);
      requirePermission(permissions.edit || permissions.create, 'Admin access is required to test provider credentials.');

      const provider = String(req.body.provider ?? '').trim().toLowerCase() as ExternalProviderKey;
      let clientId = String(req.body.clientId ?? '').trim();
      let clientSecret = String(req.body.clientSecret ?? '').trim();
      const recordId = String(req.body.id ?? '').trim();
      let usesStoredCredentials = false;
      let storedSecretUpdatedAt: string | undefined;

      if (Boolean(clientId) !== Boolean(clientSecret)) {
        res.status(400).json({
          success: false,
          errorMessage: 'Client ID and Client secret must be tested together.',
        });
        return;
      }

      /*
       * Existing unverified records can be tested without asking the Admin to
       * re-enter a secret that ManatOS already stores encrypted. Only the
       * trusted UI server receives the decrypted pair from the internal API;
       * it is never sent to browser JavaScript.
       */
      if (!clientId && !clientSecret && recordId) {
        const stored = (
          await apiClient.get<{
            id: string;
            provider: ExternalProviderKey;
            clientId: string;
            clientSecret: string;
            secretUpdatedAt: string;
          }>(
            `/api/v1/internal/external-auth-providers/${encodeURIComponent(recordId)}/credentials-for-test`,
            { ...apiSessionOptions(req), internal: true },
          )
        ).data;

        if (stored.provider !== provider) {
          res.status(400).json({ success: false, errorMessage: 'The stored credentials do not match this provider.' });
          return;
        }

        clientId = stored.clientId;
        clientSecret = stored.clientSecret;
        usesStoredCredentials = true;
        storedSecretUpdatedAt = stored.secretUpdatedAt;
      }

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

      /*
       * Build the pending test as a local, fully typed value before assigning it
       * to the Express session. Besides avoiding optional-session narrowing
       * problems, this keeps exactOptionalPropertyTypes happy: optional values
       * are omitted rather than explicitly written as undefined.
       */
      const pendingCredentialTest: NonNullable<typeof req.session.pendingExtAuthCredentialTest> = {
        testId: randomUUID(),
        ...(recordId ? { recordId } : {}),
        provider,
        enabled: req.body.enabled === 'on' || req.body.enabled === 'true' || req.body.enabled === true,
        clientId,
        clientSecret,
        ...(usesStoredCredentials ? { usesStoredCredentials: true } : {}),
        ...(usesStoredCredentials && storedSecretUpdatedAt ? { storedSecretUpdatedAt } : {}),
        scope: providerDefinition.scope,
        callbackPath: providerDefinition.callbackPath,
        ...(providerDefinition.tenant ? { tenant: providerDefinition.tenant } : {}),
        returnPath: recordId
          ? `/bo/sys-ext-auth-providers/${encodeURIComponent(recordId)}`
          : '/bo/sys-ext-auth-providers/new',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      req.session.pendingExtAuthCredentialTest = pendingCredentialTest;

      // The browser starts the OAuth navigation only after the draft has
      // been captured successfully in the server-side session. Returning JSON
      // keeps validation/API failures on the edit page instead of throwing the
      // Admin back to Home and losing the unsaved form.
      res.json({
        success: true,
        testId: pendingCredentialTest.testId,
        redirectUrl: `/auth/${provider}/test-credentials`,
        statusUrl: `/bo/sys-ext-auth-providers/test-credentials/status?testId=${encodeURIComponent(pendingCredentialTest.testId)}`,
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
      const currentUser = res.locals.currentUser as SysBOUser | null;
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
          ? (pending.usesStoredCredentials
              ? 'Stored provider credentials tested successfully and are now verified.'
              : 'Provider credentials tested successfully. They are ready to save.')
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
      const currentUser = res.locals.currentUser as SysBOUser | null;
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
      const permissions = uiPermissions(res.locals.currentUser as SysBOUser | null, definition);

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

          let proposedClientId = String(req.body.clientId ?? '').trim();
          let proposedClientSecret = String(req.body.clientSecret ?? '').trim();

          /*
           * A failed provider test must not force the Admin to re-enter the
           * credential pair merely to store it unverified. Keep the exact
           * proposed pair in the short-lived server session and use it as a
           * fallback if a browser/password-manager omits either field on the
           * subsequent Save. The pair is still committed only through the
           * trusted stored-credentials API command and encrypted immediately.
           */
          const unverifiedPendingMatches =
            (pending?.status === 'failed' || pending?.status === 'pending') &&
            pending.provider === provider &&
            (pending.recordId ?? '') === id &&
            Boolean(pending.clientId) &&
            Boolean(pending.clientSecret) &&
            Date.now() - Date.parse(pending.createdAt) <= 10 * 60 * 1000;

          if (unverifiedPendingMatches) {
            proposedClientId ||= pending.clientId;
            proposedClientSecret ||= pending.clientSecret ?? '';
          }

          if (Boolean(proposedClientId) !== Boolean(proposedClientSecret)) {
            throw new AppError(
              'VALIDATION_ERROR',
              'Client ID and Client secret must be stored together.',
              'Enter both Client ID and Client secret, or leave both unchanged.',
              false,
            );
          }

          if (proposedClientId && proposedClientSecret) {
            await apiClient.post(
              '/api/v1/internal/external-auth-providers/stored-credentials',
              {
                ...(id ? { id } : {}),
                provider,
                enabled: req.body.enabled === 'on' || req.body.enabled === 'true' || req.body.enabled === true,
                clientId: proposedClientId,
                clientSecret: proposedClientSecret,
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
              res.locals.currentUser as SysBOUser | null,
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

        const currentUser = res.locals.currentUser as SysBOUser | null;
        const permissions = uiPermissions(currentUser, definition);
        requirePermission(permissions.delete, 'Delete access is required for this entity.');

        if (definition.key === 'sys-users' && currentUser && id === currentUser.id) {
          throw new AppError(
            'FORBIDDEN',
            'A SysBOUser cannot delete its own account.',
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
   * Open the future SysBOApplication playground.
   */
  router.get(
    '/sys-applications/:id/play',

    async (req, res, next) => {
      try {
        const id = routeParam(req.params.id);

        const definition = getSysBODefinition('sys-applications');
        const permissions = uiPermissions(res.locals.currentUser as SysBOUser | null, definition);
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
  currentUser: SysBOUser | null,
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
    // Generic page-context bucket consumed by metadata-driven related collections.
    relatedData: { externalIdentities: authenticationIdentities },
    referenceData: await references(req, definition),
    primaryDisplayValue: displayValue,
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
    const storedPairVerified = req.session.pendingExtAuthCredentialTest?.usesStoredCredentials === true;
    return {
      informationTitle: 'Credentials verified',
      informationMessage: storedPairVerified
        ? 'The provider accepted the stored Client ID and Client secret. The saved credential pair is now verified.'
        : 'The provider accepted the Client ID and Client secret. The verified credential pair is ready to save.',
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
 * Authentication is meaningful only for an existing SysBOUser, so it is
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
  user: SysBOUser | null,
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

function uiPermissions(user: SysBOUser | null, definition: SysBODefinition): UIEntityPermissions {
  const role = user?.role;
  const allowed = (roles: SysBOUserRole[]) => Boolean(role && roles.includes(role));

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
     * SysBOUser email verification is an explicit security command in the UI,
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
 * SysBOConfiguration deliberately keeps its purpose-built administration page.
 * All other UI-visible SysBO definitions are eligible for the #16 migration.
 */
function isMetadataDrivenUiEligible(definition: SysBODefinition): boolean {
  return definition.key !== 'sys-configurations';
}

/**
 * The temporary comparison switch is Admin-only so incomplete target pages are
 * never exposed accidentally to ordinary application users during migration.
 */
function canSelectSysBOUiImplementation(
  currentUser: SysBOUser | null,
  definition: SysBODefinition,
): boolean {
  return currentUser?.role === SysBOUserRole.Admin && isMetadataDrivenUiEligible(definition);
}

function requireSysBOUiMigrationAccess(
  currentUser: SysBOUser | null,
  definition: SysBODefinition,
): void {
  if (!canSelectSysBOUiImplementation(currentUser, definition)) {
    throw createError(403, 'Admin access is required to switch the SysBO UI implementation.');
  }
}

/**
 * Current EJS is intentionally the default. Metadata mode is honored only for
 * an Admin who could have selected it through the migration control.
 */
async function sysBOUiImplementation(
  req: Request,
  currentUser: SysBOUser | null,
  definition: SysBODefinition,
): Promise<SysBOUiImplementation> {
  if (!canSelectSysBOUiImplementation(currentUser, definition)) {
    return CURRENT_SYSBO_UI;
  }

  const configurationName = sysBOUiViewModeConfigurationNameByKey[definition.key];
  if (!configurationName) {
    return CURRENT_SYSBO_UI;
  }

  const items = await loadSysBOUiViewModeConfigurations(req);
  const setting = items.find((item) => item.name === configurationName);

  return setting?.value === 'MetadataDriven' ? METADATA_SYSBO_UI : CURRENT_SYSBO_UI;
}

async function loadSysBOUiViewModeConfigurations(
  req: Request,
): Promise<SysBOUiViewModeConfigurationItem[]> {
  const response = await apiClient.get<{ items: SysBOUiViewModeConfigurationItem[] }>(
    '/api/v1/SysConfigurations',
    apiSessionOptions(req),
  );

  return response.data.items;
}

async function persistSysBOUiImplementation(
  req: Request,
  definition: SysBODefinition,
  implementation: SysBOUiImplementation,
): Promise<void> {
  const configurationName = sysBOUiViewModeConfigurationNameByKey[definition.key];
  if (!configurationName) {
    throw createError(400, 'This SysBO does not participate in the #16 UI migration.');
  }

  const items = await loadSysBOUiViewModeConfigurations(req);
  const setting = items.find((item) => item.name === configurationName);
  if (!setting) {
    throw createError(500, `Missing temporary #16 SysConfiguration setting '${configurationName}'.`);
  }

  await apiClient.patch(
    `/api/v1/SysConfigurations/${encodeURIComponent(setting.id)}/value`,
    { value: implementation === METADATA_SYSBO_UI ? 'MetadataDriven' : 'CurrentEJS' },
    apiSessionOptions(req),
  );
}

function sysBOUiSelectorModel(
  req: Request,
  currentUser: SysBOUser | null,
  definition: SysBODefinition,
  implementation: SysBOUiImplementation,
) {
  return {
    sysBOUiImplementation: implementation,
    sysBOUiImplementationSelectable: canSelectSysBOUiImplementation(currentUser, definition),
    sysBOUiReturnPath: req.originalUrl,
    sysBOUiActiveTab: typeof req.query.tab === 'string' ? req.query.tab : '',
  };
}

/**
 * Keep the post-switch redirect inside the selected SysBO routes. This preserves
 * list query strings and record URLs without accepting an arbitrary redirect.
 */
function safeSysBOReturnPath(value: unknown, key: string): string {
  const candidate = String(value ?? '');
  const prefix = `/bo/${key}`;

  return candidate === prefix ||
    candidate.startsWith(`${prefix}/`) ||
    candidate.startsWith(`${prefix}?`)
    ? candidate
    : prefix;
}

/**
 * Load the canonical, UI-neutral SysBO metadata through the public API
 * boundary. The #16 renderer intentionally does not import entity-specific
 * UI definitions: even the current EJS implementation is treated as an API
 * client while the metadata-driven engine is developed.
 */
async function canonicalSysBOMetadata(
  req: Request,
  definition: SysBODefinition,
): Promise<SysBOMetadata<Record<string, unknown>>> {
  const apiPath = apiPathFor(definition.key);

  const response = await apiClient.get<{ metadata: SysBOMetadata<Record<string, unknown>> }>(
    `/api/v1/${apiPath}/$metadata`,
    apiSessionOptions(req),
  );

  return response.data.metadata;
}

/** Load the framework-neutral presentation metadata for one SysBO. */
async function canonicalSysBOUIMetadata(
  req: Request,
  definition: SysBODefinition,
): Promise<SysBOUIMetadata> {
  const apiPath = apiPathFor(definition.key);
  const response = await apiClient.get<{ metadataUI: SysBOUIMetadata }>(
    `/api/v1/${apiPath}/$metadata-ui`,
    apiSessionOptions(req),
  );

  return response.data.metadataUI;
}

function metadataDrivenListQuery(
  req: Request,
  metadataUI: SysBOUIMetadata,
): {
  params: URLSearchParams;
  pageSizeOptions: number[];
  query: Record<string, string>;
} {
  const runtimeUi = uiBootstrapState().ui;
  const pageSizeOptions = runtimeUi.pageSizeOptions.filter((value) => Number.isInteger(value) && value > 0);
  const safePageSizeOptions = [...new Set([runtimeUi.defaultPageSize, ...pageSizeOptions])]
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((left, right) => left - right);
  const requestedPageSize = Number(req.query.pageSize);

  if (safePageSizeOptions.includes(requestedPageSize)) {
    req.session.uiPageSize = requestedPageSize;
  }

  const sessionPageSize = req.session.uiPageSize;
  const pageSize =
    typeof sessionPageSize === 'number' && safePageSizeOptions.includes(sessionPageSize)
      ? sessionPageSize
      : runtimeUi.defaultPageSize;

  const requestedPage = Number(req.query.page);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const query: Record<string, string> = { page: String(page), pageSize: String(pageSize) };

  const requestedSort = typeof req.query.sort === 'string' ? req.query.sort : '';
  if (requestedSort && metadataUI.list.sortableFields.includes(requestedSort)) {
    params.set('sort', requestedSort);
    query.sort = requestedSort;
    const direction = req.query.direction === 'desc' ? 'desc' : 'asc';
    params.set('direction', direction);
    query.direction = direction;
  }

  for (const field of metadataUI.list.filterFields) {
    const value = req.query[`filter.${field}`];
    if (typeof value === 'string' && value.trim()) {
      params.set(`filter.${field}`, value);
      query[`filter.${field}`] = value;
    }
  }

  return { params, pageSizeOptions: safePageSizeOptions, query };
}

async function renderMetadataDrivenListPlaceholder(
  req: Request,
  res: Response,
  definition: SysBODefinition,
  permissions: ReturnType<typeof uiPermissions>,
): Promise<void> {
  const currentUser = res.locals.currentUser as SysBOUser | null;
  const [metadata, metadataUI] = await Promise.all([
    canonicalSysBOMetadata(req, definition),
    canonicalSysBOUIMetadata(req, definition),
  ]);
  const apiPath = apiPathFor(definition.key);
  const listQuery = metadataDrivenListQuery(req, metadataUI);
  const response = await apiClient.get<SysBOListData<Record<string, unknown>>>(
    `/api/v1/${apiPath}?${listQuery.params.toString()}`,
    apiSessionOptions(req),
  );

  let hasAnyEntries = response.data.paging.total > 0;
  const filtersActive = metadataUI.list.filterFields.some(
    (field) => Boolean(listQuery.query[`filter.${field}`]),
  );

  if (!hasAnyEntries && filtersActive) {
    const unfiltered = await apiClient.get<SysBOListData<Record<string, unknown>>>(
      `/api/v1/${apiPath}?page=1&pageSize=1`,
      apiSessionOptions(req),
    );
    hasAnyEntries = unfiltered.data.paging.total > 0;
  }

  let allExternalProvidersConfigured = false;
  if (definition.key === 'sys-ext-auth-providers') {
    const definitions = (
      await apiClient.get<{ providers: ExternalAuthProviderDefinition[] }>(
        '/api/v1/SysExtAuthProviders/definitions',
        apiSessionOptions(req),
      )
    ).data.providers;
    allExternalProvidersConfigured = response.data.paging.total >= definitions.length;
  }

  applySysBOListContext(res, definition, {
    metadata,
    metadataUI,
    items: response.data.items,
    paging: response.data.paging,
    query: { ...listQuery.query, pageSize: String(response.data.paging.pageSize) },
    permissions,
  });

  await renderPage(res, 'pages/metadata-driven/bo-list-metadata', {
    title: metadata.pluralName,
    titleIcon: definition.uiMetadata.icon,
    definition,
    metadata,
    metadataUI,
    permissions,
    hasAnyEntries,
    allExternalProvidersConfigured,
    items: response.data.items,
    paging: response.data.paging,
    pageSizeOptions: listQuery.pageSizeOptions,
    query: { ...listQuery.query, pageSize: String(response.data.paging.pageSize) },
    ...sysBOUiSelectorModel(req, currentUser, definition, METADATA_SYSBO_UI),
  });
}

async function renderMetadataDrivenRecordPlaceholder(
  req: Request,
  res: Response,
  definition: SysBODefinition,
  permissions: ReturnType<typeof uiPermissions>,
  record: { isNew: boolean; recordId?: string },
): Promise<void> {
  const currentUser = res.locals.currentUser as SysBOUser | null;
  const recordMode = record.isNew ? 'create' : permissions.edit ? 'edit' : 'view';
  const [metadata, metadataUI] = await Promise.all([
    canonicalSysBOMetadata(req, definition),
    canonicalSysBOUIMetadata(req, definition),
  ]);
  const modeLabel = recordMode === 'create' ? 'Add' : recordMode === 'edit' ? 'Edit' : 'View';
  const primaryField = metadata.fieldDefinition[metadata.primaryField];

  if (!primaryField) {
    throw createError(500, `Primary field '${metadata.primaryField}' is missing from ${metadata.key} metadata.`);
  }

  const item = record.recordId
    ? (
        await apiClient.get<Record<string, unknown>>(
          `/api/v1/${apiPathFor(definition.key)}/${record.recordId}`,
          apiSessionOptions(req),
        )
      ).data
    : {};

  const supplemental = await editPageSupplementalData(
    req,
    definition,
    currentUser,
    item,
    record.isNew,
  );

  applySysBOEntryContext(
    res,
    definition,
    recordMode,
    record.isNew ? null : item,
    {
      recordId: record.recordId ?? null,
      formValues: item,
      metadata,
      metadataUI,
      permissions,
      referenceData: supplemental.referenceData,
      externalIdentities: supplemental.relatedData.externalIdentities,
      activeTab: typeof req.query.tab === 'string' ? req.query.tab : null,
    },
  );

  const primaryDisplayValue = !record.isNew && supplemental.primaryDisplayValue && supplemental.primaryDisplayValue !== 'entry'
    ? ` - ${supplemental.primaryDisplayValue}`
    : '';

  await renderPage(res, 'pages/metadata-driven/bo-entry-metadata', {
    title: `${modeLabel} ${metadata.name}${primaryDisplayValue}`,
    titleIcon: definition.uiMetadata.icon,
    definition,
    metadata,
    metadataUI,
    primaryField,
    permissions,
    recordMode,
    recordId: record.recordId ?? null,
    item,
    ...supplemental,
    ...sysBOUiSelectorModel(req, currentUser, definition, METADATA_SYSBO_UI),
  });
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
