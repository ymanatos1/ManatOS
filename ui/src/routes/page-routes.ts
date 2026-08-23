import { Router } from 'express';

import createError from 'http-errors';

import { AppError, validatePassword, type SysUser } from '@manatos/shared';

import { apiClient } from '../api-client.js';

import { apiSessionOptions } from '../auth/api-session.js';

import { config } from '../config.js';

import { requireSignedIn } from '../middleware/auth.js';

import { requireCsrf } from '../middleware/csrf.js';

import { emailService } from '../email/email-service.js';

import { renderPage } from '../render.js';

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
   * API documentation link.
   */
  router.get(
    '/api-link',

    (_req, res) => res.redirect(`${config.API_BASE_URL}/api-docs/`),
  );

  router.get(
    '/account',

    requireSignedIn,

    async (_req, res) =>
      renderPage(
        res,
        'pages/account',

        {
          title: 'Account details',
        },
      ),
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
        const user = res.locals.currentUser as SysUser;

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
          title: (res.locals.currentUser as SysUser & { hasPassword?: boolean }).hasPassword
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
          await apiClient.put<SysUser>(
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

        await emailService.sendPasswordChangedEmail(updated);

        res.redirect('/account?message=password-changed');
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
