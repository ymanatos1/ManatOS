import { Router } from 'express';

import {
  AppError,
  validatePassword,
  type SysBOUser,
} from '@manatos/shared';

import { apiClient } from '../../api/client.js';
import { emailService } from '../../email/email-service.js';
import { securityTokenStore } from '../../security/security-token-store.js';
import {
  availableProviders,
  externalVerificationSource,
} from '../../auth/providers/runtime-registry.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { renderPage } from '../../presentation/render-page.js';
import {
  absoluteUrl,
  createTrustedApiSession,
  establishUiSession,
  suggestExternalUserName,
} from './shared.js';

/**
 * External-account completion router.
 *
 * This module owns the explicit user/account work that happens after an
 * external identity has authenticated successfully: acknowledging an already
 * linked account, linking an unlinked provider identity to an existing local
 * account, and completing registration for a new external account.
 *
 * Provider OAuth/OpenID redirects and callbacks remain in
 * external-auth-router.ts. Keeping those transport/authentication concerns
 * separate from account mutation makes the top-level auth router a composer
 * and keeps account-linking authorization boundaries visible.
 */
export function createExternalAccountRouter() {
  const router = Router();

  /**
   * Explain that a provider selected for registration is already linked to
   * an existing ManatOS account. The provider authentication succeeded, but
   * signing in remains an explicit user choice.
   */
  router.get(
    '/register/existing-external',

    async (req, res) => {
      const pending = req.session.pendingExternalExistingAccount;

      if (!pending) {
        res.redirect('/');

        return;
      }

      await renderPage(
        res,
        'pages/external-existing-account',
        {
          title: 'Account already connected',
          titleIcon: 'bi-person-check',
          authProviders: availableProviders(),
          profile: pending,
        },
      );
    },
  );

  router.post(
    '/register/existing-external/signin',

    requireCsrf,

    async (req, res, next) => {
      try {
        const pending = req.session.pendingExternalExistingAccount;

        if (!pending) {
          res.redirect('/');

          return;
        }

        const login = await createTrustedApiSession(
          req,
          pending.existingUserId,
          `ManatOS Web UI / ${pending.provider}`,
        );

        await establishUiSession(req, login, pending.provider);

        delete req.session.pendingExternalExistingAccount;

        res.redirect('/account');
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Display explicit external-account linking confirmation.
   *
   * Reaching this page means:
   *
   * 1. an external provider authenticated successfully;
   * 2. that provider identity is not currently linked;
   * 3. its verified/usable email belongs to an existing ManatOS account.
   *
   * The email match identifies a possible account but does not authorize
   * the link.  The existing ManatOS credentials must still be supplied.
   */
  router.get(
    '/link/external',

    async (req, res) => {
      const pending = req.session.pendingExternalLink;

      if (!pending) {
        res.redirect('/');

        return;
      }

      await renderPage(
        res,
        'pages/external-link',

        {
          title: 'Link external account',
          titleIcon: 'bi-link-45deg',
          authProviders: availableProviders(),

          profile: pending,
        },
      );
    },
  );

  /**
   * Authenticate the existing ManatOS account and explicitly attach the
   * pending external-provider identity to it.
   */
  router.post(
    '/link/external',

    requireCsrf,

    async (req, res, next) => {
      try {
        const pending = req.session.pendingExternalLink;

        if (!pending) {
          throw new AppError(
            'EXTERNAL_LINK_SESSION_EXPIRED',

            'External account linking session expired.',

            'The external account linking request has expired. Please start again.',
          );
        }

        const identity = String(req.body.identity ?? '').trim();

        const password = String(req.body.password ?? '');

        if (!identity || !password) {
          throw new AppError(
            'EXTERNAL_LINK_CREDENTIALS_REQUIRED',

            'Existing account credentials are required.',

            'Enter your existing ManatOS user name or email and password.',
          );
        }

        /**
         * Verify ownership of the existing ManatOS account through the trusted
         * internal credential verifier. Unlike normal login this intentionally
         * does not require email verification and does not create a session.
         */

        /* console.log('[external-link] STAGE 1 - verify-local starting', {
          identity,
          pendingUserId: pending.existingUserId,
          pendingUserName: pending.existingUserName,
          provider: pending.provider,
          providerEmail: pending.email,
          providerEmailVerified: pending.emailVerified,
        }); */

        const verifiedUser = (
          await apiClient.post<SysBOUser>(
            '/api/v1/internal/auth/verify-local',

            {
              identity,
              password,
            },

            {
              internal: true,
            },
          )
        ).data;

        /* console.log('[external-link] STAGE 1 - verify-local succeeded', {
          verifiedUserId: verifiedUser.id,
          verifiedUserName: verifiedUser.name,
          verifiedUserEmail: verifiedUser.email,
          verifiedUserEmailVerified: verifiedUser.emailVerified,
        }); */

        /**
         * The credentials must authenticate the SAME account that owns the
         * email returned by the external provider.
         */
        if (verifiedUser.id !== pending.existingUserId) {
          throw new AppError(
            'EXTERNAL_LINK_ACCOUNT_MISMATCH',

            `Authenticated SysBOUser ${verifiedUser.id} does not match pending external-link SysBOUser ${pending.existingUserId}.`,

            `Please sign in to the existing account "${pending.existingUserName}" to link this external account.`,
          );
        }

        /**
         * Persist the normalized provider identity.
         *
         * The API service already enforces uniqueness of:
         *
         *     provider + providerSubject
         */

        /* console.log('[external-link] STAGE 2 - external identity link starting', {
          userId: verifiedUser.id,
          provider: pending.provider,
          providerSubject: pending.providerSubject,
        }); */

        await apiClient.post(
          `/api/v1/internal/SysUsers/${verifiedUser.id}/external-identities`,
          {
            provider: pending.provider,

            providerSubject: pending.providerSubject,

            email: pending.email,

            emailVerified: pending.emailVerified,

            ...(pending.displayName
              ? {
                  displayName: pending.displayName,
                }
              : {}),
          },

          {
            internal: true,
          },
        );

        /* console.log('[external-link] STAGE 2 - external identity link succeeded'); */

        /**
         * External authentication and external email verification are separate
         * facts. If the provider explicitly verified this exact email, accept
         * that as verification provenance for the matching ManatOS account and
         * invalidate outstanding internal verification links.
         */
        if (pending.emailVerified) {
          const source = externalVerificationSource(pending.provider);

          /* console.log('[external-link] STAGE 3 - email verification starting', {
            userId: verifiedUser.id,
            source,
          }); */

          await apiClient.put(
            `/api/v1/internal/SysUsers/${verifiedUser.id}/email-verified`,
            { source },
            { internal: true },
          );

          /* console.log('[external-link] STAGE 3 - email verification succeeded'); */

          securityTokenStore.invalidateEmailVerificationTokens(verifiedUser.id, source);
        }

        if (!verifiedUser.emailVerified && !pending.emailVerified) {
          /**
           * The external identity is now safely linked, but neither ManatOS nor
           * the provider has verified the email. Keep email verification as a
           * separate requirement and issue a fresh link without invalidating
           * any older still-valid link.
           */
          const verificationToken = securityTokenStore.create(
            verifiedUser.id,
            'verify-email',
            1440,
          );

          await emailService.sendWelcomeAndVerificationEmail(
            verifiedUser,
            absoluteUrl(req, `/auth/verify-email?token=${encodeURIComponent(verificationToken)}`),
          );

          delete req.session.pendingExternalLink;

          res.redirect('/?message=verification-sent');

          return;
        }

        /* console.log('[external-link] STAGE 4 - trusted API session starting', {
          userId: verifiedUser.id,
        }); */

        const login = await createTrustedApiSession(
          req,
          verifiedUser.id,
          `ManatOS Web UI / ${pending.provider}`,
        );

        /* console.log('[external-link] STAGE 4 - trusted API session succeeded', {
          sessionUserId: login.user.id,
          sessionUserName: login.user.name,
        }); */

        await establishUiSession(req, login, pending.provider);

        res.redirect('/account?message=external-account-linked');
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Complete registration begun through Google/Facebook/etc.
   */
  router.get(
    '/register/external',

    async (req, res) => {
      const profile = req.session.pendingExternalRegistration;

      if (!profile) {
        res.redirect('/');
        return;
      }

      await renderPage(res, 'pages/external-registration', {
        title: req.session.pendingExternalRegistrationIntent === 'signin'
          ? 'Create account'
          : 'Complete registration',
        titleIcon: 'bi-person-plus',
        authProviders: availableProviders(),
        profile,
        suggestedUserName: await suggestExternalUserName(profile),
        startedAsSignIn: req.session.pendingExternalRegistrationIntent === 'signin',
      });
    },
  );

  router.post(
    '/register/external',

    requireCsrf,

    async (req, res, next) => {
      try {
        const profile = req.session.pendingExternalRegistration;

        if (!profile) {
          throw new Error('External registration session expired.');
        }

        const password = String(req.body.password ?? '');

        if (password && password !== String(req.body.confirmPassword ?? '')) {
          throw new AppError(
            'PASSWORD_CONFIRMATION_MISMATCH',

            'Password confirmation mismatch.',

            'The two password values do not match.',
          );
        }

        if (password) {
          const failures = validatePassword(password);

          if (failures.length) {
            throw new AppError(
              'PASSWORD_POLICY',

              failures.join(' '),

              failures.join(' '),
            );
          }
        }

        /**
         * Trusted external registration.
         *
         * The API still forces role Guest.
         *
         * Unlike public email registration, provider-verified email may be
         * marked verified immediately.
         */
        const user = (
          await apiClient.post<SysBOUser>(
            '/api/v1/internal/auth/register-external',

            {
              name: req.body.name,

              email: profile.email,

              emailVerified: profile.emailVerified,

              ...(profile.emailVerified
                ? {
                    emailVerificationSource: externalVerificationSource(profile.provider),
                  }
                : {}),

              ...(password
                ? {
                    password,
                  }
                : {}),

              ...(profile.firstName
                ? {
                    firstName: profile.firstName,
                  }
                : {}),

              ...(profile.lastName
                ? {
                    lastName: profile.lastName,
                  }
                : {}),
            },

            {
              internal: true,
            },
          )
        ).data;

        /**
         * Persist normalized provider identity separately from SysBOUser.
         */
        await apiClient.post(
          `/api/v1/internal/SysUsers/${user.id}/external-identities`,

          {
            provider: profile.provider,

            providerSubject: profile.providerSubject,

            email: profile.email,

            emailVerified: profile.emailVerified,

            ...(profile.displayName
              ? {
                  displayName: profile.displayName,
                }
              : {}),
          },

          {
            internal: true,
          },
        );

        const verificationUrl = profile.emailVerified
          ? undefined
          : absoluteUrl(
              req,

              `/auth/verify-email?token=${encodeURIComponent(
                securityTokenStore.create(user.id, 'verify-email', 1440),
              )}`,
            );

        await emailService.sendWelcomeAndVerificationEmail(user, verificationUrl);

        /**
         * A provider-verified account can obtain its API session now.
         *
         * An unverified account must follow the verification link first.
         */
        if (profile.emailVerified) {
          const login = await createTrustedApiSession(
            req,
            user.id,
            `ManatOS Web UI / ${profile.provider}`,
          );

          await establishUiSession(req, login, profile.provider);

          delete req.session.pendingExternalRegistration;
          delete req.session.pendingExternalRegistrationIntent;

          res.redirect('/account');

          return;
        }

        delete req.session.pendingExternalRegistration;
        delete req.session.pendingExternalRegistrationIntent;

        res.redirect('/?message=verification-sent');
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
