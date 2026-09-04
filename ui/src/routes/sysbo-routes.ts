import { Router } from 'express';

import createError from 'http-errors';

import {
  AppError,
  operationContext,
  SysBOUserRole,
  compileExpression,
} from '@manatos/shared';

import { apiClient } from '../api/client.js';

import { config } from '../config.js';

import { apiSessionOptions } from '../auth/api-session.js';

import { requireSignedIn } from '../middleware/auth.js';

import { requireCsrf } from '../middleware/csrf.js';

import { canonicalSysBOMetadata } from './sysbo/data-access.js';
import { resolveUIEntityPermissions, requirePermission } from '../sysbo/permissions.js';
import { renderMetadataDrivenList } from './sysbo/list-renderer.js';
import { renderMetadataDrivenRecord } from './sysbo/record-renderer.js';
import { renderMetadataDrivenHierarchyWorkspace } from './sysbo/hierarchy-renderer.js';
import { commitMetadataDrivenHierarchy } from './sysbo/hierarchy-write.js';
import { ownerManagedEntryFromRequest, mergeOwnerManagedEntryFromRequest } from './sysbo/owner-managed-entry.js';
import {
  startExternalProviderCredentialTest,
  externalProviderCredentialTestStatus,
  cancelExternalProviderCredentialTest,
  handleExternalProviderCredentialSave,
} from './sysbo/external-provider-write.js';
import {
  persistMetadataDrivenEntry,
  completeMetadataDrivenSave,
  failedSaveItemOverride,
  deleteMetadataDrivenEntry,
} from './sysbo/entry-write.js';

import { uiBootstrapState } from '../bootstrap/ui-bootstrap.js';
import { clearApiTrafficEntries, listApiTrafficEntries } from '../debug/api-traffic-store.js';

import { addSessionError } from '../errors/session-error-log.js';

import { getSysBODefinition } from '../sysbo/definitions.js';

import type { SysBODefinition } from '../sysbo/types.js';



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
   * Browser-owned hybrid evaluation delegates only the reached resolver-backed
   * function call. The UI server preserves the authenticated session boundary
   * and forwards the request to the API capability provider.
   */
  router.post('/expression/evaluate-function', requireCsrf, async (req, res, next) => {
    try {
      const functionName = String(req.body?.functionName ?? '');
      const args = Array.isArray(req.body?.args) ? req.body.args : [];
      const response = await apiClient.post<{ value: unknown }>(
        '/api/v1/expressions/evaluate-function',
        { functionName, args },
        apiSessionOptions(req),
      );
      res.set('Cache-Control', 'no-store');
      res.json({ value: response.data.value });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Development-only sanitized UI -> API transport trace. The store lives in
   * the UI-server process, so it naturally resets when that process restarts.
   */
  router.get('/debug/api-traffic', (req, res) => {
    if (config.NODE_ENV === 'production') { res.sendStatus(404); return; }
    const afterId = typeof req.query.after === 'string' ? req.query.after : undefined;
    res.set('Cache-Control', 'no-store');
    res.json({ entries: listApiTrafficEntries(afterId) });
  });

  router.post('/debug/api-traffic/clear', requireCsrf, (req, res) => {
    if (config.NODE_ENV === 'production') { res.sendStatus(404); return; }
    clearApiTrafficEntries();
    res.set('Cache-Control', 'no-store');
    res.json({ success: true });
  });

  /** Developer CLI compiles ad-hoc expressions with the canonical parser. */
  router.post('/debug/compile-expression', requireCsrf, (req, res) => {
    if (config.NODE_ENV === 'production') { res.sendStatus(404); return; }
    try {
      const expression = String(req.body?.expression ?? '').trim();
      if (!expression) { res.status(400).json({ error: 'Expression is required.' }); return; }
      const compiled = compileExpression(expression);
      res.set('Cache-Control', 'no-store');
      res.json({ expression: compiled.source, ast: compiled.ast });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Expression could not be parsed.' });
    }
  });

  /**
   * All generic SysBO administration pages now use the canonical metadata-driven
   * renderer. The metadata-driven contract is the only generic SysBO page engine.
   */
  router.get('/:key', async (req, res, next) => {
    try {
      const definition = getSysBODefinition(routeParam(req.params.key));
      if (definition.key === 'sys-ext-auth-providers') delete req.session.pendingExtAuthCredentialTest;
      const permissions = await resolveUIEntityPermissions(req, definition);
      requirePermission(permissions.read, 'Read access is required for this entity.');
      await renderMetadataDrivenList(req, res, definition, permissions);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:key/new', async (req, res, next) => {
    try {
      const definition = getSysBODefinition(routeParam(req.params.key));
      const permissions = await resolveUIEntityPermissions(req, definition);
      requirePermission(permissions.create, 'Create access is required for this entity.');
      await renderMetadataDrivenRecord(req, res, definition, permissions, { isNew: true });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Generic self-referencing hierarchy workspace routes.
   *
   * Entities opt in through metadata by declaring a hierarchy-tree component
   * with workspaceKey/options. The route therefore receives only an entity key
   * plus an optional initial/focus member; it contains no Principal-specific
   * relationship or type knowledge.
   */
  router.get('/:key/hierarchy/new', async (req, res, next) => {
    try {
      const definition = getSysBODefinition(routeParam(req.params.key));
      const permissions = await resolveUIEntityPermissions(req, definition);
      requirePermission(permissions.create, 'Create access is required for this entity.');
      await renderMetadataDrivenHierarchyWorkspace(req, res, definition, permissions, null);
    } catch (error) {
      next(error);
    }
  });

  router.post('/:key/hierarchy/commit', requireCsrf, async (req, res, next) => {
    try {
      const definition = getSysBODefinition(routeParam(req.params.key));
      const permissions = await resolveUIEntityPermissions(req, definition);
      requirePermission(permissions.create || permissions.update || permissions.delete, 'Write access is required to commit this hierarchy.');

      const result = await commitMetadataDrivenHierarchy(req, definition);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:key/:id/hierarchy', async (req, res, next) => {
    try {
      const definition = getSysBODefinition(routeParam(req.params.key));
      const id = routeParam(req.params.id);
      const permissions = await resolveUIEntityPermissions(req, definition, id);
      requirePermission(permissions.read, 'Read access is required for this entity.');
      await renderMetadataDrivenHierarchyWorkspace(req, res, definition, permissions, id);
    } catch (error) {
      next(error);
    }
  });


  /**
   * Open a full metadata-driven entry whose immediate owner is an in-memory
   * aggregate page. The complete owner snapshot is posted by the browser, so
   * the selected record is resolved from owner.entries[] and never fetched by
   * record id from the API. This route is generic for any future owner page.
   */
  router.post('/:key/owned-entry/:id', requireCsrf, async (req, res, next) => {
    try {
      const definition = getSysBODefinition(routeParam(req.params.key));
      const id = routeParam(req.params.id);
      const permissions = await resolveUIEntityPermissions(req, definition, id);
      requirePermission(permissions.read, 'Read access is required for this entity.');

      const { item, parentOwnerContext } = ownerManagedEntryFromRequest(req, id);
      await renderMetadataDrivenRecord(req, res, definition, permissions, {
        isNew: false,
        recordId: id,
        itemOverride: { ...item },
        parentOwnerContext,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Save a child record back to its owning aggregate. This deliberately does
   * not call the entity CRUD API: persistence belongs to the owner workspace.
   */
  router.post('/:key/owned/save', requireCsrf, async (req, res, next) => {
    try {
      const definition = getSysBODefinition(routeParam(req.params.key));
      const id = String(req.body.id ?? '');
      const permissions = await resolveUIEntityPermissions(req, definition, id || undefined);
      requirePermission(permissions.update, 'Update access is required for this entity.');

      const metadata = await canonicalSysBOMetadata(req, definition);
      const ownerUpdate = mergeOwnerManagedEntryFromRequest(req, metadata);
      await renderMetadataDrivenHierarchyWorkspace(
        req,
        res,
        definition,
        permissions,
        ownerUpdate.focusedMemberId,
        ownerUpdate,
      );
    } catch (error) {
      next(error);
    }
  });

  router.get('/:key/:id', async (req, res, next) => {
    try {
      const definition = getSysBODefinition(routeParam(req.params.key));
      const id = routeParam(req.params.id);
      const permissions = await resolveUIEntityPermissions(req, definition, id);
      requirePermission(permissions.read, 'Read access is required for this entity.');
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
      const permissions = await resolveUIEntityPermissions(req, definition);
      requirePermission(permissions.update || permissions.create, 'Admin access is required to test provider credentials.');

      res.json(await startExternalProviderCredentialTest(req));
    } catch (error) {
      if (error instanceof AppError && error.code === 'VALIDATION_ERROR') {
        res.status(400).json({ success: false, errorMessage: error.userMessage });
        return;
      }
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
      const permissions = await resolveUIEntityPermissions(req, definition);
      requirePermission(permissions.update || permissions.create, 'Admin access is required to inspect provider credential tests.');

      const status = externalProviderCredentialTestStatus(req);
      if (!status) {
        res.status(404).json({ success: false, status: 'missing', message: 'The provider credential test is no longer available.' });
        return;
      }
      res.set('Cache-Control', 'no-store');
      res.json(status);
    } catch (error) {
      next(error);
    }
  });

  router.post('/sys-ext-auth-providers/test-credentials/cancel', requireCsrf, (req, res) => {
    cancelExternalProviderCredentialTest(req);
    res.json({ success: true, status: 'cancelled' });
  });

  /**
   * Create or update one SysBO entry.
   */
  router.post(
    '/:key/save',
    requireCsrf,
    async (req, res, next) => {
      const definition = getSysBODefinition(routeParam(req.params.key));
      const id = String(req.body.id ?? '');
      const permissions = await resolveUIEntityPermissions(req, definition, id || undefined);

      try {
        requirePermission(
          id ? permissions.update : permissions.create,
          id ? 'Update access is required for this entity.' : 'Create access is required for this entity.',
        );

        const providerSavedId = await handleExternalProviderCredentialSave(req, definition, id);
        if (providerSavedId !== null) {
          await completeMetadataDrivenSave(req, res, definition, providerSavedId || undefined);
          return;
        }

        const { savedId, savedRecord } = await persistMetadataDrivenEntry(req, definition, id);
        await completeMetadataDrivenSave(req, res, definition, savedId || undefined, savedRecord);
      } catch (error) {
        if (error instanceof AppError && error.code === 'UI_API_SESSION_EXPIRED') {
          next(error);
          return;
        }
        if (createError.isHttpError(error)) {
          next(error);
          return;
        }

        const appError = error instanceof AppError
          ? error
          : new AppError('UNEXPECTED_ERROR', String(error), 'The entry could not be saved.', true);

        addSessionError(req, appError);
        await renderMetadataDrivenRecord(req, res, definition, permissions, {
          isNew: !id,
          ...(id ? { recordId: id } : {}),
          itemOverride: failedSaveItemOverride(req, definition, id),
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

        const permissions = await resolveUIEntityPermissions(req, definition, id);
        requirePermission(permissions.delete, 'Delete access is required for this entity.');

        await deleteMetadataDrivenEntry(req, definition, id);
        res.redirect(`/bo/${definition.key}`);
      } catch (error) {
        next(error);
      }
    },
  );


  return router;
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
