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
  evaluateExpression,
  type ManatOSContext,
} from '@manatos/shared';

import { apiClient } from '../api-client.js';

import { config } from '../config.js';

import { apiSessionOptions } from '../auth/api-session.js';

import { requireSignedIn } from '../middleware/auth.js';

import { requireCsrf } from '../middleware/csrf.js';

import { renderPage } from '../render.js';
import { metadataComponentPartialFor } from '../presentation/metadata-component-registry.js';

import { uiBootstrapState } from '../bootstrap/ui-bootstrap.js';

import { addSessionError } from '../errors/session-error-log.js';

import { getSysBODefinition } from '../sysbo/definitions.js';

import type { SysBODefinition } from '../sysbo/types.js';

import { externalIdentitiesForUser } from '../auth/user-authentication.js';
import { refreshExternalProviderRegistry } from '../auth/providers/runtime-registry.js';
import { configurePassport } from '../auth/passport.js';
import {
  contextFields,
  entityContextName,
  pageContextNode,
  pageEntryRuntimeContext,
  pageListRuntimeContext,
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
    sections: Array<{ title: string; steps: string[] }>;
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

/** Generic SysBO list payload returned by the API. */
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
  const { metadata, uiMetadata, items, query, ...pageValues } = values;

  registerContextEntity(
    ctx,
    definition.key,
    metadata ?? definition.boMetadata,
    uiMetadata,
  );

  const effectiveUI = uiMetadata as SysBOUIMetadata | undefined;
  const filterFields = effectiveUI?.list?.filterFields
    ?? [];
  const safeQuery = query && typeof query === 'object' && !Array.isArray(query)
    ? query as Readonly<Record<string, unknown>>
    : {};
  const safeItems = Array.isArray(items)
    ? items.filter((item): item is Readonly<Record<string, unknown>> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
  const runtime = pageListRuntimeContext(safeItems, filterFields, safeQuery);

  const page = pageContextNode(
    entityContextName(definition.key),
    'sysbo-list',
    'list',
    contextFields({
      entity: entityContextName(definition.key),
      query: safeQuery,
      ...pageValues,
    }),
    null,
    runtime,
  );

  res.locals.ctx = setPageContext(ctx, page);
  return page;
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
  const { metadata, uiMetadata, formValues, parentListContext, ...pageValues } = values;

  registerContextEntity(
    ctx,
    definition.key,
    metadata ?? definition.boMetadata,
    uiMetadata,
  );

  const runtimeEntryValues =
    formValues && typeof formValues === 'object' && !Array.isArray(formValues)
      ? (formValues as Record<string, unknown>)
      : entry ?? {};

  const canonical = (metadata ?? definition.boMetadata) as SysBOMetadata<Record<string, unknown>>;
  const ui = uiMetadata as SysBOUIMetadata | undefined;

  /*
   * Build one normalized record-shaped baseline before creating either the
   * field contexts or dataOriginal/dataCurrent. This is especially important
   * in create mode: an empty API item still renders real field values (for
   * example enabled=true and null enum/reference selections), so CTX must start
   * with those same logical values rather than empty record snapshots.
   *
   * Sensitive fields are intentionally excluded from browser CTX. Dynamic
   * create defaults remain evaluator concerns; static defaults can safely seed
   * the initial record here.
   */
  /*
   * Start from the API-safe runtime projection, not only canonical persisted
   * fields. Some entities deliberately expose additional non-sensitive runtime
   * facts (for example password/secret *presence* booleans) that calculations
   * may consume even though those facts are not persisted entity properties.
   *
   * The API projection is the security boundary; known canonical sensitive
   * fields are still stripped defensively here. This keeps the entry-context
   * builder entity/field agnostic and avoids teaching it about hasPassword,
   * hasClientSecret, or any future projection-specific field.
   */
  const initialRecordValues: Record<string, unknown> = Object.fromEntries(
    Object.entries(runtimeEntryValues).filter(([key]) => canonical.fieldDefinition[key]?.sensitive !== true),
  );

  for (const [key, field] of Object.entries(canonical.fieldDefinition)) {
    if (field.sensitive) continue;

    if (Object.prototype.hasOwnProperty.call(initialRecordValues, key)) {
      continue;
    }

    const createDefault = mode === 'create'
      ? ui?.record?.fieldOverrides?.[key]?.createDefaultValue
      : undefined;
    const staticCreateDefault =
      createDefault === null || ['string', 'number', 'boolean'].includes(typeof createDefault)
        ? createDefault
        : undefined;

    if (staticCreateDefault !== undefined) {
      initialRecordValues[key] = staticCreateDefault;
    } else if (field.type === 'boolean') {
      initialRecordValues[key] = false;
    } else if (field.type === 'string' || field.type === 'email' || field.type === 'version') {
      initialRecordValues[key] = '';
    } else {
      // guid/date/number/enum/reference have a natural empty CTX value of null.
      initialRecordValues[key] = null;
    }
  }

  const referenceData = pageValues.referenceData && typeof pageValues.referenceData === 'object' && !Array.isArray(pageValues.referenceData)
    ? pageValues.referenceData as Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>
    : {};

  let entryFields = contextFields(
    {
      ...initialRecordValues,
      ...pageValues,
    },
    canonical.fieldDefinition,
    referenceData,
  );

  /*
   * Evaluator-backed create defaults are resolved generically against the same
   * field CTX that the page will expose. This lets metadata say things such as
   * `FirstCtx(platformId.options, 'value')` or `CurrentDay()` without teaching the
   * route about License, Platform, dates, or any other entity-specific rule.
   * The evaluated values become part of dataOriginal first; dataCurrent then
   * starts as its strict clone, preserving the page-state golden rule.
   */
  if (mode === 'create') {
    for (const [key, override] of Object.entries(ui?.record?.fieldOverrides ?? {})) {
      const dynamicDefault = override?.createDefaultValue;
      if (!dynamicDefault || typeof dynamicDefault !== 'object' || typeof dynamicDefault.expression !== 'string') {
        continue;
      }

      const currentValue = initialRecordValues[key];
      if (currentValue !== null && currentValue !== undefined && currentValue !== '') {
        continue;
      }

      try {
        initialRecordValues[key] = evaluateExpression(
          dynamicDefault.expression,
          ctx,
          entryFields,
          {
            source: 'ui-metadata',
            sourcePath: `record.fieldOverrides.${key}.createDefaultValue`,
            targetPath: `ctx.page.page.fields.${key}.value`,
            purpose: 'resolve metadata-driven create default',
          },
        );

        // Later defaults may depend on values resolved earlier in this pass.
        entryFields = contextFields(
          {
            ...initialRecordValues,
            ...pageValues,
          },
          canonical.fieldDefinition,
          referenceData,
        );
      } catch (error) {
        console.error(`[ManatOS create default] ${definition.key}.${key}`, error);
      }
    }
  }

  /*
   * Expression-backed UI fields become real calculated CTX variables. Parsing
   * happens here, when the context variable is declared, while variable/path
   * resolution remains completely lazy and context-dependent at value access.
   */
  // API $metadata-ui is already the effective UI contract. Current-EJS paths
  // do not use that contract, so fall back to canonical derived fields there.
  const effectiveDerivedFields = {
    ...(canonical.derivedFields ?? {}),
    ...(ui?.record?.derivedFields ?? {}),
  };
  for (const [derivedName, derived] of Object.entries(effectiveDerivedFields)) {
    if (!derived.expression) continue;
    entryFields[derivedName] = calculatedContextField(derived.expression, {
      value: initialRecordValues[derivedName],
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
    null,
    pageEntryRuntimeContext(initialRecordValues),
  );

  const parentList = parentListContext && typeof parentListContext === 'object' && !Array.isArray(parentListContext)
    ? parentListContext as Readonly<Record<string, unknown>>
    : {};
  const parentItems = Array.isArray(parentList.items)
    ? parentList.items.filter((item): item is Readonly<Record<string, unknown>> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
  const parentQuery = parentList.query && typeof parentList.query === 'object' && !Array.isArray(parentList.query)
    ? parentList.query as Readonly<Record<string, unknown>>
    : {};
  const parentFilterFields = ui?.list?.filterFields
    ?? [];

  /*
   * The entry page is a logical child of the list page, not a replacement for
   * it. Rebuild the parent with its own runtime data so expressions in the
   * child can still inspect ctx.page.filters/dataList while the entry scope is
   * active. The parent is discarded only when navigation leaves this hierarchy.
   */
  const listPage = pageContextNode(
    entityContextName(definition.key),
    'sysbo-list',
    'list',
    contextFields({
      entity: entityContextName(definition.key),
      ...(parentList.paging !== undefined ? { paging: parentList.paging } : {}),
      ...(parentList.permissions !== undefined ? { permissions: parentList.permissions } : {}),
      ...(parentList.referenceData !== undefined ? { referenceData: parentList.referenceData } : {}),
    }),
    entryPage,
    pageListRuntimeContext(parentItems, parentFilterFields, parentQuery),
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
   * All generic SysBO administration pages now use the canonical metadata-driven
   * renderer. The metadata-driven contract is the only generic SysBO page engine.
   */
  router.get('/:key', async (req, res, next) => {
    try {
      const definition = getSysBODefinition(routeParam(req.params.key));
      if (definition.key === 'sys-ext-auth-providers') delete req.session.pendingExtAuthCredentialTest;
      const currentUser = res.locals.currentUser as SysBOUser | null;
      const permissions = uiPermissions(currentUser, definition);
      requirePermission(permissions.view, 'Read access is required for this entity.');
      await renderMetadataDrivenList(req, res, definition, permissions);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:key/new', async (req, res, next) => {
    try {
      const definition = getSysBODefinition(routeParam(req.params.key));
      const currentUser = res.locals.currentUser as SysBOUser | null;
      const permissions = uiPermissions(currentUser, definition);
      requirePermission(permissions.create, 'Create access is required for this entity.');
      await renderMetadataDrivenRecord(req, res, definition, permissions, { isNew: true });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:key/:id', async (req, res, next) => {
    try {
      const definition = getSysBODefinition(routeParam(req.params.key));
      const id = routeParam(req.params.id);
      const currentUser = res.locals.currentUser as SysBOUser | null;
      const permissions = uiPermissions(currentUser, definition, id);
      requirePermission(permissions.view, 'Read access is required for this entity.');
      await renderMetadataDrivenRecord(req, res, definition, permissions, {
        isNew: false,
        recordId: id,
      });
    } catch (error) {
      next(error);
    }
  });

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
      // Credential removal is an immediate trusted command. Return to the
      // workflow that initiated it instead of falling back to the entry's
      // default General tab. The freshly rendered Secrets component will now
      // enter empty credential-edit mode automatically.
      res.redirect(`/bo/sys-ext-auth-providers/${id}?tab=secrets`);
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
      const currentUser = res.locals.currentUser as SysBOUser | null;
      const permissions = uiPermissions(currentUser, definition, id || undefined);

      try {
        requirePermission(
          id ? permissions.edit : permissions.create,
          id
            ? 'Edit access is required for this entity.'
            : 'Create access is required for this entity.',
        );

        if (definition.key === 'sys-ext-auth-providers') {
          const pending = req.session.pendingExtAuthCredentialTest;

          /*
           * Provider is immutable after creation. Its enum control is therefore
           * disabled on edit pages and, by HTML design, disabled controls are
           * omitted from form submission. Never turn that browser omission into
           * an empty/unsupported provider, and do not trust a tampered hidden
           * value either: for existing records resolve the provider identity from
           * the persisted record at the API boundary. Create mode still takes the
           * explicitly selected provider from the submitted form.
           */
          let provider = String(req.body.provider ?? '').trim().toLowerCase();
          if (id) {
            const existingProvider = await apiClient.get<Record<string, unknown>>(
              `/api/v1/${apiPath}/${encodeURIComponent(id)}`,
              apiSessionOptions(req),
            );
            provider = String(existingProvider.data.provider ?? '').trim().toLowerCase();
          }

          const verifiedPendingMatches =
            pending?.status === 'verified' &&
            pending.provider === provider &&
            (pending.recordId ?? '') === id &&
            Date.now() - Date.parse(pending.createdAt) <= 10 * 60 * 1000;

          if (verifiedPendingMatches && pending?.clientSecret) {
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

          /*
           * Testing an already-stored pair commits its verified flag in the
           * callback itself and intentionally erases the pending plaintext
           * secret. Consume that completed session state before the ordinary
           * settings save rather than letting a stale verified workflow linger.
           */
          if (verifiedPendingMatches && pending?.usesStoredCredentials) {
            delete req.session.pendingExtAuthCredentialTest;
          } else if (verifiedPendingMatches && !pending?.clientSecret) {
            throw new AppError(
              'VALIDATION_ERROR',
              'Verified provider credential state is incomplete.',
              'The credential test completed but the pending credential pair is no longer available. Test the credentials again before saving.',
              false,
            );
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

          const credentialMutationRequested =
            req.body.providerCredentialMutation === 'true' ||
            Boolean(proposedClientSecret) ||
            unverifiedPendingMatches;

          if (credentialMutationRequested && Boolean(proposedClientId) !== Boolean(proposedClientSecret)) {
            throw new AppError(
              'VALIDATION_ERROR',
              'Client ID and Client secret must be stored together.',
              'Enter both Client ID and Client secret, or leave both unchanged.',
              false,
            );
          }

          if (credentialMutationRequested && proposedClientId && proposedClientSecret) {
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

        /*
         * Authorization/navigation failures are HTTP failures, not editable
         * form validation failures. Preserve their status rather than wrapping
         * them as UNEXPECTED_ERROR and attempting to re-render the record form.
         */
        if (createError.isHttpError(error)) {
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

        await renderMetadataDrivenRecord(req, res, definition, permissions, {
          isNew: !id,
          ...(id ? { recordId: id } : {}),
          itemOverride: { ...req.body, ...(id ? { id } : {}) },
          applicationError: appError,
        });
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
        const permissions = uiPermissions(currentUser, definition, id);

        /*
         * Own-account deletion is a distinct security invariant, not merely a
         * missing role permission. Report the stable FORBIDDEN application
         * error before the generic permission gate so every route explains the
         * actual reason consistently.
         */
        if (definition.key === 'sys-users' && currentUser && id === currentUser.id) {
          throw new AppError(
            'FORBIDDEN',
            'A SysBOUser cannot delete its own account.',
            'You cannot delete your own user account.',
            false,
          );
        }

        requirePermission(permissions.delete, 'Delete access is required for this entity.');

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


  return router;
}

/**
 * Build supplemental data required by the canonical metadata-driven SysBO
 * record page (references, related collections, delete impact and domain
 * component data that is intentionally outside ordinary CRUD payloads).
 */
async function editPageSupplementalData(
  req: Request,
  definition: SysBODefinition,
  currentUser: SysBOUser | null,
  item: Record<string, unknown>,
  isNew: boolean,
  effectiveUIMetadata?: SysBOUIMetadata,
) {
  const itemId = typeof item.id === 'string' ? item.id : '';

  const authenticationIdentities =
    definition.key === 'sys-users' && !isNew && itemId
      ? await externalIdentitiesForUser(itemId)
      : [];

  /*
   * Load metadata-declared read-only related collections generically. The
   * owning entity declares only the related SysBO, the FK/filter field and
   * the current entry field to use as the filter value. No Principal,
   * Application or License key is known by this loader.
   */
  const relatedData: Record<string, unknown[]> = {
    externalIdentities: authenticationIdentities,
  };
  const relatedReferenceData: Record<string, Record<string, unknown[]>> = {};
  if (!isNew) {
    for (const [collectionKey, collection] of Object.entries(effectiveUIMetadata?.record.relatedCollections ?? {})) {
      if (collection.source?.kind !== 'entity-query') continue;

      const currentField = collection.source.currentField ?? 'id';
      const filterValue = item[currentField];
      const sourceKey = collection.sourceKey ?? collectionKey;
      if (filterValue === undefined || filterValue === null || filterValue === '') {
        relatedData[sourceKey] = [];
        continue;
      }

      const relatedDefinition = getSysBODefinition(collection.entityKey);
      const params = new URLSearchParams({
        page: '1',
        pageSize: String(collection.source.pageSize ?? 100),
        [`filter.${collection.source.filterField}`]: String(filterValue),
      });
      if (collection.source.sort) params.set('sort', collection.source.sort);
      if (collection.source.direction) params.set('direction', collection.source.direction);

      const response = await apiClient.get<SysBOListData<Record<string, unknown>>>(
        `/api/v1/${apiPathFor(relatedDefinition.key)}?${params.toString()}`,
        apiSessionOptions(req),
      );
      relatedData[sourceKey] = response.data.items;

      const needsReferenceData = Object.keys(collection.fields || {}).some(
        (fieldKey) => relatedDefinition.boMetadata.fieldDefinition[fieldKey]?.type === 'reference',
      );
      if (needsReferenceData) {
        relatedReferenceData[sourceKey] = await references(req, relatedDefinition);
      }
    }
  }

  const deleteImpact = !isNew && itemId && uiPermissions(currentUser, definition, itemId).delete
    ? (
        await apiClient.get<{
          targetObjectKey: string;
          targetId: string;
          canExecute: boolean;
          requiresConfirmation: boolean;
          impacts: Array<{
            objectKey: string;
            objectName: string;
            relationship: string;
            count: number;
            action: 'restrict' | 'cascade' | 'set-null' | 'unlink' | 'retain';
            confirmation: 'silent' | 'confirm' | 'inherit';
          }>;
        }>(
          `/api/v1/${apiPathFor(definition.key)}/${encodeURIComponent(itemId)}/$delete-impact`,
          apiSessionOptions(req),
        )
      ).data
    : null;

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

  const pageReferenceData = await references(req, definition);
  if (definition.key === 'sys-ext-auth-providers') {
    /*
     * Contextual enum options use the same generic CTX `.options` contract as
     * references. In create mode this naturally removes already-configured
     * providers without teaching the renderer about provider identities.
     */
    pageReferenceData.provider = externalAuthProviderDefinitions.map((providerDefinition) => ({
      value: providerDefinition.provider,
      label: providerDefinition.label,
      icon: providerDefinition.icon.replace(/^bi-/, ''),
      callbackPath: providerDefinition.callbackPath,
      tenant: providerDefinition.tenant ?? null,
    }));
  }

  return {
    authenticationIdentities,
    // Generic page-context bucket consumed by metadata-driven related collections.
    relatedData,
    relatedReferenceData,
    referenceData: pageReferenceData,
    primaryDisplayValue: displayValue,
    deletePresentation: {
      displayValue,
      entityLabel: definition.boMetadata.name,
    },
    deleteImpact,

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

/** Return short-lived provider credential-test state for the current metadata page. */
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

interface UIEntityPermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

function uiPermissions(
  user: SysBOUser | null,
  definition: SysBODefinition,
  recordId?: string,
): UIEntityPermissions {
  const role = user?.role;
  const allowed = (roles: SysBOUserRole[]) => Boolean(role && roles.includes(role));

  const base: UIEntityPermissions = {
    view: allowed(definition.permissions.view),
    create: allowed(definition.permissions.create),
    edit: allowed(definition.permissions.edit),
    delete: allowed(definition.permissions.delete),
  };

  /*
   * SysBOUser has one record-scoped invariant that cannot be represented by
   * role arrays alone: every authenticated user owns their own user record.
   *
   * The API AuthorizationService already permits that record to be updated
   * while separately forbidding non-Admin role assignment and all own-user
   * deletion. Mirror those semantics in the UI so Guest/User/Superuser do not
   * get an artificial read-only form for themselves.
   */
  if (user && definition.key === 'sys-users' && recordId === user.id) {
    return {
      ...base,
      view: true,
      edit: true,
      delete: false,
    };
  }

  return base;
}

function requirePermission(allowed: boolean, message: string): void {
  if (!allowed) {
    throw createError(403, message);
  }
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

    // External-provider credentials are a trusted compound command, never
    // ordinary CRUD fields. Client ID therefore travels only through the
    // credential workflow together with its secret.
    if (definition.key === 'sys-ext-auth-providers' && field.key === 'clientId') {
      continue;
    }

    const raw = body[field.key];

    if (field.type === 'boolean') {
      output[field.key] = raw === 'on' || raw === 'true' || raw === true;
    } else if (field.type === 'number') {
      output[field.key] = Number(raw ?? 0);
    } else if (field.type === 'duration') {
      if (raw === undefined || raw === '') {
        if (field.nullable) output[field.key] = null;
        continue;
      }

      let parsed: unknown = raw;
      if (typeof raw === 'string') {
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new AppError(
            'VALIDATION_ERROR',
            `Invalid duration payload for ${field.key}.`,
            `${field.label} is not a valid duration.`,
            false,
          );
        }
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new AppError(
          'VALIDATION_ERROR',
          `Invalid duration payload for ${field.key}.`,
          `${field.label} is not a valid duration.`,
          false,
        );
      }
      const source = parsed as Record<string, unknown>;
      const durationPart = (key: 'years' | 'months' | 'days') => {
        const value = Number(source[key] ?? 0);
        if (!Number.isInteger(value) || value < 0) {
          throw new AppError(
            'VALIDATION_ERROR',
            `Duration ${field.key}.${key} must be a non-negative integer.`,
            `${field.label} must use whole, non-negative years, months and days.`,
            false,
          );
        }
        return value;
      };
      output[field.key] = {
        years: durationPart('years'),
        months: durationPart('months'),
        days: durationPart('days'),
      };
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

    const referencedDefinition = getSysBODefinition(field.referenceBOKey);
    output[field.key] = response.data.items.map((item) => ({
      ...(item as Record<string, unknown>),
      __entityIcon: referencedDefinition.icon.replace(/^bi-/, ''),
    }));
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
 * Load canonical, UI-neutral SysBO metadata through the public API boundary.
 * Generic administration pages are metadata-driven only; no local Current-EJS
 * presentation contract participates in this path anymore.
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
  sourceQuery: Readonly<Record<string, unknown>> = req.query,
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
  const requestedPageSize = Number(sourceQuery.pageSize);

  if (safePageSizeOptions.includes(requestedPageSize)) {
    req.session.uiPageSize = requestedPageSize;
  }

  const sessionPageSize = req.session.uiPageSize;
  const pageSize =
    typeof sessionPageSize === 'number' && safePageSizeOptions.includes(sessionPageSize)
      ? sessionPageSize
      : runtimeUi.defaultPageSize;

  const requestedPage = Number(sourceQuery.page);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  const query: Record<string, string> = { page: String(page), pageSize: String(pageSize) };

  const requestedSort = typeof sourceQuery.sort === 'string' ? sourceQuery.sort : '';
  if (requestedSort && metadataUI.list.sortableFields.includes(requestedSort)) {
    params.set('sort', requestedSort);
    query.sort = requestedSort;
    const direction = sourceQuery.direction === 'desc' ? 'desc' : 'asc';
    params.set('direction', direction);
    query.direction = direction;
  }

  for (const field of metadataUI.list.filterFields) {
    const value = sourceQuery[`filter.${field}`];
    if (typeof value === 'string' && value.trim()) {
      params.set(`filter.${field}`, value);
      query[`filter.${field}`] = value;
    }
  }

  return { params, pageSizeOptions: safePageSizeOptions, query };
}

async function renderMetadataDrivenList(
  req: Request,
  res: Response,
  definition: SysBODefinition,
  permissions: ReturnType<typeof uiPermissions>,
): Promise<void> {
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

  let addActionDisabled = false;
  const addConstraintFieldKey = metadataUI.list.addAction.disableWhenAllEnumValuesExistForField;
  if (addConstraintFieldKey) {
    const constraintField = metadata.fieldDefinition[addConstraintFieldKey];
    if (constraintField?.type === 'enum' && (constraintField.enumValues?.length ?? 0) > 0) {
      let totalEntries = response.data.paging.total;
      if (filtersActive) {
        const unfiltered = await apiClient.get<SysBOListData<Record<string, unknown>>>(
          `/api/v1/${apiPath}?page=1&pageSize=1`,
          apiSessionOptions(req),
        );
        totalEntries = unfiltered.data.paging.total;
      }
      addActionDisabled = totalEntries >= (constraintField.enumValues?.length ?? 0);
    }
  }

  const listReferenceFields = [...new Set([
    ...metadataUI.list.visibleFields,
    ...metadataUI.list.filterFields,
  ])];
  const listReferenceData = listReferenceFields.some(
    (fieldKey) => metadata.fieldDefinition[fieldKey]?.type === 'reference',
  )
    ? await references(req, definition)
    : {};

  const listPage = applySysBOListContext(res, definition, {
    metadata,
    uiMetadata: metadataUI,
    items: response.data.items,
    paging: response.data.paging,
    query: { ...listQuery.query, pageSize: String(response.data.paging.pageSize) },
    permissions,
    referenceData: listReferenceData,
  });
  const listItems = listPage.dataList ?? [];

  await renderPage(res, 'pages/metadata-driven/bo-list-metadata', {
    title: metadata.pluralName,
    titleIcon: definition.icon,
    definition,
    metadata,
    metadataUI,
    permissions,
    hasAnyEntries,
    addActionDisabled,
    referenceData: listReferenceData,
    items: listItems,
    paging: response.data.paging,
    pageSizeOptions: listQuery.pageSizeOptions,
    query: { ...listQuery.query, pageSize: String(response.data.paging.pageSize) },
    metadataComponentPartialFor,
  });
}

/**
 * Recover the list URL that logically owns an entry page.
 *
 * Normal same-origin navigation supplies a Referer containing the exact list
 * paging/sort/filter state. Direct entry URLs have no parent browser page, so
 * they fall back to the list defaults/session page size. This keeps the CTX
 * hierarchy complete without persisting page data beyond its logical lifetime.
 */
function parentListQueryForEntry(
  req: Request,
  definition: SysBODefinition,
): Record<string, string> {
  const referrer = req.get('referer');
  if (!referrer) return {};

  try {
    const origin = `${req.protocol}://${req.get('host')}`;
    const url = new URL(referrer, origin);
    const expectedPath = `/bo/${definition.key}`;
    if (url.origin !== origin || url.pathname !== expectedPath) return {};

    return Object.fromEntries(url.searchParams.entries());
  } catch {
    return {};
  }
}

/** Load the parent list snapshot before creating the child entry CTX node. */
async function parentListContextForEntry(
  req: Request,
  definition: SysBODefinition,
  metadata: SysBOMetadata<Record<string, unknown>>,
  metadataUI: SysBOUIMetadata,
  permissions: ReturnType<typeof uiPermissions>,
): Promise<Readonly<Record<string, unknown>>> {
  const sourceQuery = parentListQueryForEntry(req, definition);
  const listQuery = metadataDrivenListQuery(req, metadataUI, sourceQuery);
  const response = await apiClient.get<SysBOListData<Record<string, unknown>>>(
    `/api/v1/${apiPathFor(definition.key)}?${listQuery.params.toString()}`,
    apiSessionOptions(req),
  );
  const referenceFields = [...new Set([
    ...metadataUI.list.visibleFields,
    ...metadataUI.list.filterFields,
  ])];
  const referenceData = referenceFields.some(
    (fieldKey) => metadata.fieldDefinition[fieldKey]?.type === 'reference',
  )
    ? await references(req, definition)
    : {};

  return {
    items: response.data.items,
    paging: response.data.paging,
    query: { ...listQuery.query, pageSize: String(response.data.paging.pageSize) },
    permissions,
    referenceData,
  };
}

async function renderMetadataDrivenRecord(
  req: Request,
  res: Response,
  definition: SysBODefinition,
  permissions: ReturnType<typeof uiPermissions>,
  record: {
    isNew: boolean;
    recordId?: string;
    itemOverride?: Record<string, unknown>;
    applicationError?: AppError;
  },
): Promise<void> {
  const currentUser = res.locals.currentUser as SysBOUser | null;
  const effectivePermissions = record.isNew
    ? permissions
    : uiPermissions(currentUser, definition, record.recordId);
  const recordMode = record.isNew ? 'create' : effectivePermissions.edit ? 'edit' : 'view';
  const [metadata, metadataUI] = await Promise.all([
    canonicalSysBOMetadata(req, definition),
    canonicalSysBOUIMetadata(req, definition),
  ]);
  const modeLabel = recordMode === 'create' ? 'Add' : recordMode === 'edit' ? 'Edit' : 'View';
  const primaryField = metadata.fieldDefinition[metadata.primaryField];

  if (!primaryField) {
    throw createError(500, `Primary field '${metadata.primaryField}' is missing from ${metadata.key} metadata.`);
  }

  const item = record.itemOverride ?? (record.recordId
    ? (
        await apiClient.get<Record<string, unknown>>(
          `/api/v1/${apiPathFor(definition.key)}/${record.recordId}`,
          apiSessionOptions(req),
        )
      ).data
    : {});

  const supplemental = await editPageSupplementalData(
    req,
    definition,
    currentUser,
    item,
    record.isNew,
    metadataUI,
  );
  const parentListContext = await parentListContextForEntry(
    req,
    definition,
    metadata,
    metadataUI,
    effectivePermissions,
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
      // applySysBOEntryContext expects the effective UI contract under the
      // uiMetadata key. Passing `metadataUI` as a shorthand property silently
      // left that parameter undefined, so the CTX entity registry missed the
      // effective UI metadata even though the renderer itself received it. The
      // compiled browser AST for
      // reactive field rules (for example Parent principal editability) was absent.
      uiMetadata: metadataUI,
      permissions: effectivePermissions,
      referenceData: supplemental.referenceData,
      ...supplemental.relatedData,
      activeTab: typeof req.query.tab === 'string' ? req.query.tab : null,
      parentListContext,
    },
  );

  const primaryDisplayValue = !record.isNew && supplemental.primaryDisplayValue && supplemental.primaryDisplayValue !== 'entry'
    ? ` - ${supplemental.primaryDisplayValue}`
    : '';

  await renderPage(res, 'pages/metadata-driven/bo-entry-metadata', {
    title: `${modeLabel} ${metadata.name}${primaryDisplayValue}`,
    titleIcon: definition.icon,
    definition,
    metadata,
    metadataUI,
    primaryField,
    permissions: effectivePermissions,
    recordMode,
    recordId: record.recordId ?? null,
    item,
    ...supplemental,
    ...credentialTestResultPresentation(req),
    ...(record.applicationError ? { applicationError: record.applicationError } : {}),
    metadataComponentPartialFor,
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
