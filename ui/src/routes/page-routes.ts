import { Router } from 'express';

import createError from 'http-errors';

import { AppError, MANATOS_COMPANY, validatePassword, type SysBOUser } from '@manatos/shared';

import { apiClient } from '../api-client.js';

import { apiSessionOptions } from '../auth/api-session.js';

import { config } from '../config.js';

import { requireAdmin, requireSignedIn } from '../middleware/auth.js';

import { requireCsrf } from '../middleware/csrf.js';

import { emailService } from '../email/email-service.js';

import { renderPage } from '../render.js';

import { externalIdentitiesForUser } from '../auth/user-authentication.js';

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


  router.get('/configuration', requireSignedIn, requireAdmin, async (req, res, next) => {
    try {
      const response = await apiClient.get<{ items: Array<Record<string, unknown>> }>('/api/v1/SysConfigurations', apiSessionOptions(req));
      const groups: Record<string, Array<Record<string, unknown>>> = {};
      for (const item of response.data.items) { const group=String(item.group ?? 'General'); (groups[group] ??= []).push(item); }
      await renderPage(res, 'pages/configuration', {
        title:'Configuration',
        titleIcon:'bi-sliders2',
        titleSubtitle:'Runtime application settings. Changes marked restart-required take effect after the corresponding service restarts.',
        configurationGroups:groups,
      });
    } catch (error) { next(error); }
  });

  router.post('/configuration/:id', requireSignedIn, requireAdmin, requireCsrf, async (req, res, next) => {
    try {
      await apiClient.patch(
        '/api/v1/SysConfigurations/' + encodeURIComponent(String(req.params.id ?? '')) + '/value',
        { value:req.body.value ?? null },
        apiSessionOptions(req),
      );

      // Configuration forms progressively enhance to an in-place Apply action.
      // Keep the redirect fallback for browsers/clients that submit normally.
      if (req.accepts(['json', 'html']) === 'json') {
        res.json({ success: true });
        return;
      }

      res.redirect('/configuration?message=saved');
    } catch (error) { next(error); }
  });

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
   * mCRM-specific literals so future platforms automatically gain the same
   * page structure and navigation behavior.
   */
  router.get(['/platform', '/platform/:platformId'], async (req, res, next) => {
    try {
      const requestedId = typeof req.params.platformId === 'string' && req.params.platformId
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
        titleIcon: 'bi-boxes',
        titleSubtitle: platform.presentation?.subtitle ?? platform.name,
        breadcrumbTitle: `Platform · ${platform.shortName}`,
        platform,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * Application design/runtime playground landing page.
   *
   * The first version is intentionally only a welcome surface. Future
   * SysBOApplication selection, design and execution features will be added
   * behind this stable route.
   */
  router.get(
    '/app-playground',
    requireSignedIn,
    async (_req, res, next) => {
      const currentUser = res.locals.currentUser as SysBOUser | null;
      const platformEntitled = Boolean(res.locals.app?.currentPlatformEntitled);
      if (!currentUser || !platformEntitled) {
        next(createError(403, 'Apps Playground access requires a current mCRM license entitlement.'));
        return;
      }

      await renderPage(
        res,
        'pages/app-playground',
        {
          title: 'Apps Playground',
          titleIcon: 'bi-play-circle-fill',
        },
      );
    },
  );

  /**
   * API documentation link.
   */
  router.get(
    '/api-link',

    (_req, res) => res.redirect(`${config.API_BASE_URL}/api-docs/`),
  );

  router.get(
    '/account',

    requireSignedIn,

    async (_req, res, next) => {
      try {
        const user = res.locals.currentUser as SysBOUser;
        const authenticationIdentities = await externalIdentitiesForUser(user.id);

        await renderPage(
          res,
          'pages/account',

          {
            title: `Account details - [${user.name}]`,
            breadcrumbTitle: 'Account details',
            titleIcon: 'bi-person-vcard',
            authenticationIdentities,
          },
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/personal',

    requireSignedIn,

    async (_req, res) =>
      renderPage(
        res,
        'pages/personal',

        {
          title: 'Personal details',
        },
      ),
  );

  /**
   * Update personal account information through the authenticated user's
   * normal API Bearer session.
   */
  router.post(
    '/personal',

    requireSignedIn,
    requireCsrf,

    async (req, res, next) => {
      try {
        const user = res.locals.currentUser as SysBOUser;

        await apiClient.patch(
          `/api/v1/SysUsers/${user.id}`,

          {
            firstName: String(req.body.firstName ?? ''),

            lastName: String(req.body.lastName ?? ''),

            description: String(req.body.description ?? ''),
          },

          apiSessionOptions(req),
        );

        res.redirect('/personal?message=saved');
      } catch (error) {
        next(error);
      }
    },
  );

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
        const changingPassword = Boolean(
          (res.locals.currentUser as SysBOUser & { hasPassword?: boolean }).hasPassword,
        );

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

        const authenticationIdentities = await externalIdentitiesForUser(updated.id);

        try {
          await emailService.sendPasswordChangedEmail(updated);
        } catch (error) {
          /**
           * Password persistence succeeded before the notification attempt.
           * Report that primary success accurately even when SMTP delivery is
           * temporarily unavailable.
           */
          if (error instanceof AppError && error.code === 'EMAIL_DELIVERY_FAILED') {
            await renderPage(res, 'pages/account', {
              title: `Account details - [${updated.name}]`,
              breadcrumbTitle: 'Account details',
              titleIcon: 'bi-person-vcard',
              authenticationIdentities,
              warningTitle: changingPassword
                ? 'Password changed with a warning'
                : 'Password set with a warning',
              warningMessage: changingPassword
                ? 'Your password was changed successfully, but the confirmation email could not be sent.'
                : 'Your password was set successfully, but the confirmation email could not be sent.',
            });

            return;
          }

          throw error;
        }

        await renderPage(res, 'pages/account', {
          title: `Account details - [${updated.name}]`,
          breadcrumbTitle: 'Account details',
          titleIcon: 'bi-person-vcard',
          authenticationIdentities,
          informationTitle: changingPassword ? 'Password changed' : 'Password set',
          informationMessage: changingPassword
            ? 'Your password was changed successfully. A confirmation email was sent to your registered email address.'
            : 'Your password was set successfully. A confirmation email was sent to your registered email address.',
        });
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
