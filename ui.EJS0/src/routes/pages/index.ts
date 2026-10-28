import { Router } from 'express';

import createError from 'http-errors';

import {
  AppError,
  MANATOS_COMPANY,
  SysBOUserRole,
  validatePassword,
  type SysBOUser,
} from '@manatos/shared';

import { apiClient } from '../../api/client.js';

import { apiSessionOptions } from '../../auth/api-session.js';

import { config } from '../../config.js';

import { requireAdmin, requireAdminOrSuperuser, requireSignedIn } from '../../middleware/auth.js';

import { requireCsrf } from '../../middleware/csrf.js';

import { emailService } from '../../email/email-service.js';

import { renderPage } from '../../presentation/page/render-page.js';

import { getSysBODefinition } from '../../sysbo/definitions.js';
import { resolveUIEntityPermissions } from '../../sysbo/permissions.js';
import { renderMetadataDrivenRecord } from '../sysbo/entry/renderer.js';
import {
  documentationManifest,
  readDocumentationResource,
} from '../../documentation/repository-docs.js';

export function createPageRoutes() {
  const router = Router();

  router.get(
    '/',

    async (_req, res) =>
      renderPage(
        res,
        'pages/home',

        {
          title: 'Home',
        },
      ),
  );

  router.get('/configuration', requireSignedIn, requireAdminOrSuperuser, async (req, res, next) => {
    try {
      const response = await apiClient.get<{ items: Array<Record<string, unknown>> }>(
        '/api/v1/SysConfigurations',
        apiSessionOptions(req),
      );
      const groups: Record<string, Array<Record<string, unknown>>> = {};
      for (const item of response.data.items) {
        const group = String(item.group ?? 'General');
        (groups[group] ??= []).push(item);
      }
      await renderPage(res, 'pages/configuration', {
        title: 'Configuration',
        titleIcon: 'bi-sliders2',
        titleSubtitle:
          'Runtime application settings. Changes marked restart-required take effect after the corresponding service restarts.',
        configurationGroups: groups,
        configurationReadOnly: res.locals.currentUser?.role === SysBOUserRole.Superuser,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/configuration/:id',
    requireSignedIn,
    requireAdmin,
    requireCsrf,
    async (req, res, next) => {
      try {
        await apiClient.patch(
          '/api/v1/SysConfigurations/' + encodeURIComponent(String(req.params.id ?? '')) + '/value',
          { value: req.body.value ?? null },
          apiSessionOptions(req),
        );

        // Configuration forms progressively enhance to an in-place Apply action.
        // Keep the redirect fallback for browsers/clients that submit normally.
        if (req.accepts(['json', 'html']) === 'json') {
          res.json({ success: true });
          return;
        }

        res.redirect('/configuration?message=saved');
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/system-settings',
    requireSignedIn,
    requireAdminOrSuperuser,
    async (req, res, next) => {
      try {
        const response = await apiClient.get<{
          currentConfigurationId: string;
          selectedConfigurationId: string;
          runningConfigurationId: string;
          configurations: Array<Record<string, unknown>>;
          adapters: Array<Record<string, unknown>>;
          debugging: {
            apiStorageContextEnabled: boolean;
            outputDirectory: string;
          };
          restartRequired: boolean;
        }>('/api/v1/system-settings/storage', apiSessionOptions(req));

        await renderPage(res, 'pages/system-settings', {
          title: 'System settings',
          titleIcon: 'bi-gear-wide-connected',
          titleSubtitle:
            'Infrastructure settings used by ManatOS itself. Storage changes are persisted immediately and become active after the API restarts.',
          storageSettings: response.data,
          storageSettingsReadOnly: res.locals.currentUser?.role === SysBOUserRole.Superuser,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/system-settings/storage/configurations',
    requireSignedIn,
    requireAdmin,
    requireCsrf,
    async (req, res, next) => {
      try {
        const response = await apiClient.post(
          '/api/v1/system-settings/storage/configurations',
          req.body,
          apiSessionOptions(req),
        );
        res.json(response);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/system-settings/storage/configurations/order',
    requireSignedIn,
    requireAdmin,
    requireCsrf,
    async (req, res, next) => {
      try {
        const response = await apiClient.patch(
          '/api/v1/system-settings/storage/configurations/order',
          { ids: req.body.ids },
          apiSessionOptions(req),
        );
        res.json(response);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/system-settings/storage/configurations/:id/delete',
    requireSignedIn,
    requireAdmin,
    requireCsrf,
    async (req, res, next) => {
      try {
        const response = await apiClient.delete(
          '/api/v1/system-settings/storage/configurations/' +
            encodeURIComponent(String(req.params.id ?? '')),
          apiSessionOptions(req),
        );
        res.json(response);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/system-settings/storage/configurations/:id',
    requireSignedIn,
    requireAdmin,
    requireCsrf,
    async (req, res, next) => {
      try {
        const response = await apiClient.patch(
          '/api/v1/system-settings/storage/configurations/' +
            encodeURIComponent(String(req.params.id ?? '')),
          req.body,
          apiSessionOptions(req),
        );
        res.json(response);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/system-settings/storage/configurations/:id/order',
    requireSignedIn,
    requireAdmin,
    requireCsrf,
    async (req, res, next) => {
      try {
        const response = await apiClient.patch(
          '/api/v1/system-settings/storage/configurations/' +
            encodeURIComponent(String(req.params.id ?? '')) +
            '/order',
          { direction: req.body.direction },
          apiSessionOptions(req),
        );
        res.json(response);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/system-settings/storage/current',
    requireSignedIn,
    requireAdmin,
    requireCsrf,
    async (req, res, next) => {
      try {
        const response = await apiClient.patch(
          '/api/v1/system-settings/storage/current',
          { configurationId: req.body.configurationId },
          apiSessionOptions(req),
        );
        res.json(response);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/system-settings/storage/debugging',
    requireSignedIn,
    requireAdmin,
    requireCsrf,
    async (req, res, next) => {
      try {
        const response = await apiClient.patch(
          '/api/v1/system-settings/storage/debugging',
          {
            apiStorageContextEnabled: req.body.apiStorageContextEnabled === true,
            outputDirectory: req.body.outputDirectory,
          },
          apiSessionOptions(req),
        );
        res.json(response);
      } catch (error) {
        next(error);
      }
    },
  );

  for (const operation of [
    'test-connection',
    'databases',
    'database/inspect',
    'database/prepare',
    'schema/inspect',
    'schema/prepare',
  ]) {
    router.post(
      `/system-settings/storage/target/${operation}`,
      requireSignedIn,
      requireAdmin,
      requireCsrf,
      async (req, res, next) => {
        try {
          const response = await apiClient.post(
            `/api/v1/system-settings/storage/target/${operation}`,
            req.body,
            apiSessionOptions(req),
          );
          res.json(response);
        } catch (error) {
          next(error);
        }
      },
    );
  }

  router.get(
    '/company',

    async (_req, res) =>
      renderPage(
        res,
        'pages/company',

        {
          title: 'Company',
        },
      ),
  );

  /**
   * Generic platform landing page.
   *
   * The route is keyed by the shared SysPlatform catalogue rather than by
   * protoCRM-specific literals so future platforms automatically gain the same
   * page structure and navigation behavior.
   */
  router.get(['/platform', '/platform/:platformId'], async (req, res, next) => {
    try {
      const requestedId =
        typeof req.params.platformId === 'string' && req.params.platformId
          ? req.params.platformId
          : MANATOS_COMPANY.defaultPlatformId;
      const platform = MANATOS_COMPANY.platforms.find(
        (entry) => entry.enabled && entry.id === requestedId,
      );

      if (!platform) {
        throw createError(404, 'Platform not found.');
      }

      await renderPage(res, 'pages/platform', {
        title: platform.shortName,
        titleIcon: platform.icon ?? 'bi-boxes',
        titleSubtitle: platform.presentation?.subtitle ?? platform.name,
        breadcrumbTitle: `Platform · ${platform.shortName}`,
        platform,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * API documentation link.
   */
  router.get(
    '/api-link',

    (_req, res) => res.redirect(`${config.API_BASE_URL}/api-docs/`),
  );

  /**
   * Repository documentation browser.
   *
   * This is a separate top-level system tool, not a page/popup/embedded UI
   * level. Repository documentation files remain the only documentation source;
   * the browser discovers and reads that tree without copying it into a second
   * persistence model.
   */
  router.get('/documentation', requireSignedIn, async (_req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.render('pages/documentation-browser', {
        documentationManifest: await documentationManifest(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/documentation/manifest', requireSignedIn, async (_req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json({ items: await documentationManifest() });
    } catch (error) {
      next(error);
    }
  });

  router.get('/documentation/content', requireSignedIn, async (req, res, next) => {
    try {
      const requestedPath = typeof req.query.path === 'string' ? req.query.path : '';
      const resource = await readDocumentationResource(requestedPath);
      res.set('Cache-Control', 'no-store');
      res.set('Content-Type', resource.contentType);
      res.set('X-Content-Type-Options', 'nosniff');
      if (resource.resourceType === 'svg') {
        res.set(
          'Content-Security-Policy',
          "sandbox; default-src 'none'; style-src 'unsafe-inline'",
        );
      }
      res.send(resource.content);
    } catch (error) {
      next(
        createError(404, error instanceof Error ? error.message : 'Documentation file not found.'),
      );
    }
  });

  /**
   * Self-service Account is a V2 SysUser entry surface, not a second User page engine.
   * It deliberately reuses the canonical SysUser metadata/runtime while keeping
   * its own route identity and self-service lifecycle. The selected Account
   * uiView decides which canonical SysUser fields are editable.
   */
  router.get('/account', requireSignedIn, async (req, res, next) => {
    try {
      const user = res.locals.currentUser as SysBOUser & { hasPassword?: boolean };
      const definition = getSysBODefinition('sys-users');
      const permissions = await resolveUIEntityPermissions(req, definition, user.id);

      if (!permissions.read) throw createError(403, 'Read access is required for this account.');

      await renderMetadataDrivenRecord(
        req,
        res,
        definition,
        permissions,
        { isNew: false, recordId: user.id },
        {
          purpose: 'open-account-entry',
          uiViewKey: 'quickView',
          showEntryActions: false,
          title: `${res.locals.metadataText('@CM.AccountDetails')} - [${user.name}]`,
          titleIcon: 'bi-person-vcard',
          breadcrumbItems: [
            { label: 'ManatOS', href: '/' },
            { label: '@CM.AccountDetails', href: null },
          ],
          ...(req.query.message === 'password-saved-email-warning'
            ? {
                pageModel: {
                  warningTitle: user.hasPassword
                    ? 'Password changed with a warning'
                    : 'Password set with a warning',
                  warningMessage:
                    'Your password was saved successfully, but the confirmation email could not be sent.',
                },
              }
            : req.query.message === 'password-saved'
              ? {
                  pageModel: {
                    informationTitle: user.hasPassword ? 'Password changed' : 'Password set',
                    informationMessage:
                      'Your password was saved successfully. A confirmation email was sent to your registered email address.',
                  },
                }
              : {}),
        },
      );
    } catch (error) {
      next(error);
    }
  });

  // Backward-compatible alias: Personal details are now part of Account.
  router.get('/personal', requireSignedIn, (_req, res) => res.redirect('/account'));

  /**
   * Dedicated password page for the currently authenticated user.
   *
   * The same page supports both cases:
   *   - an existing local password -> Change password;
   *   - no local password          -> Set password.
   */
  router.get(
    '/account/password',

    requireSignedIn,

    async (_req, res) =>
      renderPage(
        res,
        'pages/account-password',

        {
          title: (res.locals.currentUser as SysBOUser & { hasPassword?: boolean }).hasPassword
            ? 'Change password'
            : 'Set password',
        },
      ),
  );

  /**
   * Change/set the currently authenticated user's password.
   *
   * This now uses the normal Bearer-protected auth endpoint rather than
   * the trusted internal password endpoint.
   *
   * If the account already has a local password, the API requires
   * currentPassword.
   */
  router.post(
    '/account/password',

    requireSignedIn,
    requireCsrf,

    async (req, res, next) => {
      try {
        const password = String(req.body.password ?? '');

        if (password !== String(req.body.confirmPassword ?? '')) {
          throw new AppError(
            'PASSWORD_CONFIRMATION_MISMATCH',

            'Password confirmation mismatch.',

            'The two password values do not match.',
          );
        }

        const failures = validatePassword(password);

        if (failures.length) {
          throw new AppError(
            'PASSWORD_POLICY',

            failures.join(' '),

            failures.join(' '),
          );
        }

        const currentPassword = String(req.body.currentPassword ?? '');
        const updated = (
          await apiClient.put<SysBOUser>(
            '/api/v1/auth/password',

            {
              ...(currentPassword
                ? {
                    currentPassword,
                  }
                : {}),

              newPassword: password,
            },

            apiSessionOptions(req),
          )
        ).data;

        try {
          await emailService.sendPasswordChangedEmail(updated);
        } catch (error) {
          /**
           * Password persistence succeeded before the notification attempt.
           * Report that primary success accurately even when SMTP delivery is
           * temporarily unavailable.
           */
          if (error instanceof AppError && error.code === 'EMAIL_DELIVERY_FAILED') {
            res.redirect('/account?message=password-saved-email-warning');
            return;
          }

          throw error;
        }
        res.redirect('/account?message=password-saved');
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Demonstration basic UI HTTP error.
   */
  router.get(
    '/demo-http-error',

    (_req, _res, next) => next(createError(404, 'Demonstration UI HTTP error.')),
  );

  return router;
}
