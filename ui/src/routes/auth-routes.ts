import { Router, type Request, type Response } from 'express';

import {
  AppError,
  operationContext,
  EXTERNAL_PROVIDER_KEYS,
  validatePassword,
  type EmailVerificationSource,
  type ExternalProviderKey,
  type SysUser,
} from '@manatos/shared';

import { apiClient } from '../api-client.js';
import { config } from '../config.js';

import { emailService } from '../email/email-service.js';

import { securityTokenStore } from '../security/security-token-store.js';

import { configurePassport, passport } from '../auth/passport.js';
import { configureProviderCredentialTest, removeProviderCredentialTest } from '../auth/provider-credential-test.js';

import { isRecoveryIdentitySyntaxValid } from '../auth/recovery-identity.js';

import type { ExternalProfile } from '../auth/external-profile.js';

import {
  availableProviders,
  refreshExternalProviderRegistry,
  runtimeProvider,
  externalProviderOption,
  externalVerificationSource,
} from '../auth/external-providers.js';

import { requireCsrf } from '../middleware/csrf.js';

import { renderPage } from '../render.js';

/**
 * API session returned by:
 *
 *   POST /api/v1/auth/login
 *
 * and by the trusted UI -> API authentication bridge.
 */
interface ApiLoginResult {
  accessToken: string;

  tokenType: 'Bearer';

  sessionId: string;

  expiresInSeconds: number;

  expiresAt: string;

  user: SysUser;
}

/**
 * Website authentication routes.
 *
 * Local authentication now uses the same public API login endpoint used by
 * Postman/mobile/direct API callers.
 *
 * External provider authentication remains a UI/Passport concern, but after
 * provider authentication the trusted UI asks the API to create an ordinary
 * API access-token session for the resolved SysUser.
 */
export function createAuthRouter() {
  const router = Router();

  /**
   * Local website sign-in.
   *
   * This is now the real API login flow rather than a separate internal
   * password-verification flow.
   */
  router.post(
    '/signin/local',

    requireCsrf,

    async (req, res, next) => {
      try {
        await operationContext.runRoot(
          'Sign in with email/user-name and password',

          async (scope) => {
            scope.addContext({
              identity: req.body.identity,

              password: req.body.password,
            });

            const login = (
              await apiClient.post<ApiLoginResult>(
                '/api/v1/auth/login',

                {
                  identity: req.body.identity,

                  password: req.body.password,
                },

                {
                  clientName: 'ManatOS Web UI / Local',
                },
              )
            ).data;

            await establishUiSession(req, login, 'local');

            res.redirect('/account');
          },

          'Signing in',
        );
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Register a normal local Guest account by email.
   *
   * Registration deliberately DOES NOT establish an authenticated API
   * session yet because the account email is not verified.
   */
  router.post(
    '/register/email',

    requireCsrf,

    async (req, res, next) => {
      try {
        await operationContext.runRoot(
          'Register website account by email',

          async (scope) => {
            scope.addContext({
              name: req.body.name,

              email: req.body.email,

              password: req.body.password,
            });

            if (req.body.password !== req.body.confirmPassword) {
              throw new AppError(
                'PASSWORD_CONFIRMATION_MISMATCH',

                'Password confirmation mismatch.',

                'The two password values do not match.',
              );
            }

            const passwordFailures = validatePassword(String(req.body.password ?? ''));

            if (passwordFailures.length) {
              throw new AppError(
                'PASSWORD_POLICY',

                passwordFailures.join(' '),

                passwordFailures.join(' '),
              );
            }

            /**
             * Public registration always creates Guest + unverified email.
             */
            const user = (
              await apiClient.post<SysUser>(
                '/api/v1/auth/register',

                {
                  name: req.body.name,

                  email: req.body.email,

                  password: req.body.password,

                  ...(req.body.firstName
                    ? {
                        firstName: String(req.body.firstName),
                      }
                    : {}),

                  ...(req.body.lastName
                    ? {
                        lastName: String(req.body.lastName),
                      }
                    : {}),

                  ...(req.body.description
                    ? {
                        description: String(req.body.description),
                      }
                    : {}),
                },
              )
            ).data;

            const token = securityTokenStore.create(user.id, 'verify-email', 1440);

            try {
              await emailService.sendWelcomeAndVerificationEmail(
                user,

                absoluteUrl(
                  req,

                  `/auth/verify-email?token=${encodeURIComponent(token)}`,
                ),
              );
            } catch (error) {
              /**
               * Registration and notification delivery are separate outcomes.
               *
               * The SysUser has already been created successfully at this
               * point. An SMTP/provider failure must therefore NOT report that
               * account creation itself failed, and must not encourage a Retry
               * that would immediately collide with the newly-created account.
               *
               * The account intentionally remains enabled + unverified. An
               * administrator can manually verify the address when the user
               * establishes ownership through an appropriate support channel.
               * A persistent Admin notification will be added by the generic
               * notifications subsystem rather than by this mail-specific flow.
               */
              if (error instanceof AppError && error.code === 'EMAIL_DELIVERY_FAILED') {
                await renderPage(res, 'pages/home', {
                  title: 'Home',
                  warningMessage:
                    'Your account was created, but ManatOS could not send the verification email. Your account remains unverified and cannot sign in yet. Please contact a ManatOS administrator, who can verify the email address manually after confirming ownership.',
                });

                return;
              }

              throw error;
            }

            /**
             * No userId/apiAccessToken is stored here.
             *
             * The user becomes signed in only after successful email
             * verification.
             */
            res.redirect('/?message=verification-sent');
          },

          'Creating your account',
        );
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Verify an email link and then establish the UI/API session.
   */
  router.get(
    '/verify-email',

    async (req, res, next) => {
      try {
        const verification = securityTokenStore.consumeDetailed(
          String(req.query.token ?? ''),

          'verify-email',
        );

        if (verification.status === 'already-verified') {
          await renderPage(res, 'pages/home', {
            title: 'Home',
            informationMessage: `Your email address has already been verified by ${verificationSourceLabel(verification.source)}.`,
          });

          return;
        }

        if (verification.status !== 'valid') {
          throw new AppError(
            'INVALID_TOKEN',

            'Invalid verification token.',

            'The verification link is invalid or expired.',
          );
        }

        const userId = verification.userId;

        await apiClient.put(
          `/api/v1/internal/SysUsers/${userId}/email-verified`,

          { source: 'internal' },

          {
            internal: true,
          },
        );

        /**
         * The UI has verified the account through its one-time verification
         * token, so the trusted bridge may now create the API session.
         */
        const login = await createTrustedApiSession(
          req,
          userId,
          'ManatOS Web UI / Email Verification',
        );

        await establishUiSession(req, login, 'email-verification');

        res.redirect('/account?message=email-verified');
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Request password reset instructions.
   *
   * The response deliberately does not reveal whether the supplied account
   * exists.
   *
   * Lookup uses a trusted internal endpoint because the requester is not
   * authenticated yet and therefore cannot query protected SysUsers.
   */
  router.post(
    '/password/request',

    requireCsrf,

    async (req, res) => {
      try {
        const identity = String(req.body.identity ?? '').trim();
        const user = isRecoveryIdentitySyntaxValid(identity)
          ? await lookup(identity)
          : null;

        if (user) {
          const token = securityTokenStore.create(user.id, 'reset-password', 30, {
            subjectLabel: user.name,
          });

          await emailService.sendPasswordResetEmail(
            user,

            absoluteUrl(
              req,

              `/auth/password/reset?token=${encodeURIComponent(token)}`,
            ),
          );
        }
      } catch {
        /**
         * Account discovery must not leak through this endpoint.
         */
      }

      await renderPage(res, 'pages/home', {
        title: 'Home',
        informationTitle: 'Password instructions requested',
        informationMessage:
          'If an eligible account matches the information provided, password instructions have been sent to its registered email address.',
        informationActionLabel: 'Back to sign in',
        informationActionUrl: '/?auth=signin',
      });
    },
  );

  /**
   * Display password reset form.
   */
  router.get(
    '/password/reset',

    async (req, res) => {
      await renderPage(
        res,
        'pages/password-reset',

        {
          title: 'Set or reset password',

          token: String(req.query.token ?? ''),
          tokenInfo: securityTokenStore.inspectUsable(
            String(req.query.token ?? ''),
            'reset-password',
          ),
        },
      );
    },
  );

  /**
   * Complete password reset using the one-time UI reset token.
   *
   * This is an account-recovery operation and therefore still uses the
   * trusted internal API rather than requiring an existing Bearer session.
   */
  router.post(
    '/password/reset',

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

        const userId = securityTokenStore.consume(
          String(req.body.token ?? ''),

          'reset-password',
        );

        if (!userId) {
          throw new AppError(
            'INVALID_TOKEN',

            'Invalid reset token.',

            'The password link is invalid or expired.',
          );
        }

        const user = (
          await apiClient.put<SysUser>(
            `/api/v1/internal/SysUsers/${userId}/password`,

            {
              password,
            },

            {
              internal: true,
            },
          )
        ).data;

        // A successful recovery invalidates every other outstanding reset link
        // for this account. This protects against older reset emails remaining
        // usable after the password has already been replaced.
        securityTokenStore.invalidatePasswordResetTokens(userId);

        try {
          await emailService.sendPasswordChangedEmail(user);
        } catch (error) {
          /**
           * The password has already been changed successfully. Notification
           * delivery is a secondary outcome and must not make the user believe
           * the password update itself failed.
           */
          if (error instanceof AppError && error.code === 'EMAIL_DELIVERY_FAILED') {
            await renderPage(res, 'pages/home', {
              title: 'Home',
              warningTitle: 'Password updated with a warning',
              warningMessage:
                'Your password was updated successfully, but the confirmation email could not be sent. You can sign in with the new password.',
              warningActionLabel: 'Sign in',
              warningActionUrl: '/?auth=signin',
            });

            return;
          }

          throw error;
        }

        await renderPage(res, 'pages/home', {
          title: 'Home',
          informationTitle: 'Password updated',
          informationMessage:
            'Your password was updated successfully. A confirmation email was sent to your registered email address.',
          informationActionLabel: 'Sign in',
          informationActionUrl: '/?auth=signin',
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Website logout.
   *
   * IMPORTANT:
   *
   * The browser-facing UI route remains GET for the moment because the
   * existing profile-menu item is a normal hyperlink.
   *
   * The actual API logout is correctly performed using:
   *
   *   POST /api/v1/auth/logout
   *
   * before the Express UI session is destroyed.
   */
  router.get(
    '/logout',

    async (req, res, next) => {
      try {
        const token = req.session.apiAccessToken;

        if (token) {
          try {
            await apiClient.post(
              '/api/v1/auth/logout',

              undefined,

              {
                accessToken: token,
              },
            );
          } catch (error) {
            /**
             * From the browser's point of view logout is already complete
             * if the API token was expired/revoked.
             *
             * Other API errors are also deliberately not allowed to leave
             * the browser's local UI session alive.
             */
            if (error instanceof AppError) {
              console.warn(`[UI logout] API logout returned ${error.code}: ${error.message}`);
            }
          }
        }

        req.session.destroy((error) => {
          if (error) {
            next(error);

            return;
          }

          res.redirect('/');
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Current public provider state for the Sign in/Register popups.
   *
   * The browser calls this same-origin UI endpoint only when one of the
   * authentication dialogs is opened. The UI then proxies the API's dedicated
   * anonymous-safe projection; no Client ID or secret material is returned.
   */
  router.get('/external-providers', async (_req, res) => {
    res.set('Cache-Control', 'no-store');

    try {
      const response = await apiClient.get<{
        providers: Array<{
          provider: ExternalProviderKey;
          label: string;
          icon: string;
          enabled: boolean;
          configured: boolean;
        }>;
      }>('/api/v1/public/external-auth-providers');

      res.json({ providers: response.data.providers, unavailable: false });
    } catch {
      // API absence is an expected degraded mode. The browser distinguishes
      // this from a reachable API reporting an unconfigured provider.
      res.status(503).json({ providers: [], unavailable: true });
    }
  });

  /**
   * Register stable routes for every supported provider key. The provider's
   * current credentials/scopes are loaded from the API immediately before the
   * authentication flow starts, so Admin changes from another client are not
   * hidden behind UI startup state or a TTL cache.
   */
  router.get('/:provider/test-credentials', (req, res, next) => {
    const providerKey = String(req.params.provider ?? '').toLowerCase() as ExternalProviderKey;
    const pending = req.session.pendingExtAuthCredentialTest;
    if (!pending || pending.provider !== providerKey || pending.status !== 'pending' || Date.now() - Date.parse(pending.createdAt) > 10 * 60 * 1000) {
      sendProviderCredentialTestResult(res, 'failed', 'The provider credential test expired. Return to the ManatOS editor and test the credentials again.');
      return;
    }
    try {
      const strategyName = configureProviderCredentialTest({
        testId: pending.testId, provider: pending.provider, clientId: pending.clientId,
        clientSecret: pending.clientSecret ?? '',
        callbackUrl: new URL(pending.callbackPath, config.PUBLIC_BASE_URL).toString(),
        ...(pending.tenant ? { tenant: pending.tenant } : {}),
      });
      passport.authenticate(strategyName, {
        session: false,
        ...(pending.scope.length ? { scope: pending.scope } : {}),
        state: `manatos-credential-test:${pending.testId}`,
      })(req, res, next);
    } catch (error) {
      const pending = req.session.pendingExtAuthCredentialTest;
      if (pending) {
        pending.status = 'failed';
        pending.errorMessage = providerCredentialTestError(error);
        delete pending.clientSecret;
        console.warn(
          `[AUTH] ${pending.provider} credential test could not start: ${pending.errorMessage}`,
        );
        sendProviderCredentialTestResult(res, 'failed', pending.errorMessage);
        return;
      }
      next(error);
    }
  });

  for (const providerKey of EXTERNAL_PROVIDER_KEYS) {
    router.get(
      `/${providerKey}`,

      async (req, res, next) => {
        try {
          await refreshExternalProviderRegistry();
          configurePassport();

          const provider = runtimeProvider(providerKey);

          if (!provider) {
            res.redirect('/?auth=signin&message=provider-not-configured');
            return;
          }

          req.session.externalAuthIntent =
            req.query.intent === 'register' ? 'register' : 'signin';

          passport.authenticate(providerKey, {
            session: false,
            ...(provider.scope.length ? { scope: provider.scope } : {}),
          })(req, res, next);
        } catch {
          res.redirect('/?auth=signin&message=provider-temporarily-unavailable');
        }
      },
    );

    router.get(
      `/${providerKey}/callback`,

      async (req, res, next) => {
        const pendingTest = req.session.pendingExtAuthCredentialTest;
        const credentialTestState = String(req.query.state ?? '');
        const credentialTestPrefix = 'manatos-credential-test:';
        const callbackTestId = credentialTestState.startsWith(credentialTestPrefix)
          ? credentialTestState.slice(credentialTestPrefix.length)
          : null;

        if (callbackTestId) {
          if (
            !pendingTest ||
            pendingTest.provider !== providerKey ||
            pendingTest.testId !== callbackTestId ||
            pendingTest.status !== 'pending'
          ) {
            sendProviderCredentialTestResult(
              res,
              'failed',
              'This provider credential test is no longer active. Return to the ManatOS editor and test the current credentials again.',
            );
            return;
          }
          const strategyName = configureProviderCredentialTest({
            testId: pendingTest.testId, provider: pendingTest.provider, clientId: pendingTest.clientId,
            clientSecret: pendingTest.clientSecret ?? '',
            callbackUrl: new URL(pendingTest.callbackPath, config.PUBLIC_BASE_URL).toString(),
            ...(pendingTest.tenant ? { tenant: pendingTest.tenant } : {}),
          });
          passport.authenticate(strategyName, { session: false }, (error: unknown, user: Express.User | false | null) => {
            removeProviderCredentialTest(strategyName);
            if (error || !user) {
              pendingTest.status = 'failed';
              pendingTest.errorMessage = providerCredentialTestError(error);
              delete pendingTest.clientSecret;
              console.warn(
                `[AUTH] ${pendingTest.provider} credential test failed: ${pendingTest.errorMessage}`,
              );
            } else {
              pendingTest.status = 'verified';
              pendingTest.verifiedAt = new Date().toISOString();
              delete pendingTest.errorMessage;
            }
            sendProviderCredentialTestResult(
              res,
              pendingTest.status,
              pendingTest.status === 'verified'
                ? 'Provider credentials tested successfully. They are ready to save.'
                : (pendingTest.errorMessage ?? 'The provider rejected the proposed credentials.'),
            );
          })(req, res, next);
          return;
        }
        try {
          // Re-read current state at the callback boundary as well. If an Admin
          // disabled/deleted the provider while the user was at the third party,
          // do not continue from stale Passport configuration.
          await refreshExternalProviderRegistry();
          configurePassport();

          if (!runtimeProvider(providerKey)) {
            res.redirect('/?auth=signin&message=provider-not-configured');
            return;
          }

          passport.authenticate(providerKey, {
            session: false,
            failureRedirect: '/?auth=failed',
          })(req, res, next);
        } catch {
          res.redirect('/?auth=signin&message=provider-temporarily-unavailable');
        }
      },

      async (req, res, next) => {
        try {
          const profile = req.authInfo?.externalProfile;
          const authIntent = req.session.externalAuthIntent ?? 'signin';

          delete req.session.externalAuthIntent;

          if (!profile) {
            throw new Error('External profile not supplied.');
          }

          /**
           * Resolve by provider + provider subject.
           *
           * Matching email alone never silently links an external identity.
           */
          const linkedUserId = await resolveExternalUserId(profile);

          if (linkedUserId) {
            const matchingUser = await lookup(profile.email);

            /**
             * Registration is an explicit request to create an account. If the
             * authenticated provider identity is already linked, do not silently
             * reinterpret that action as Sign in. Explain that the account already
             * exists and let the user explicitly continue into it.
             */
            if (authIntent === 'register') {
              req.session.pendingExternalExistingAccount = {
                provider: profile.provider,
                email: profile.email,
                existingUserId: linkedUserId,
                existingUserName:
                  matchingUser?.name ?? profile.displayName ?? profile.email,
              };

              res.redirect('/auth/register/existing-external');

              return;
            }

            /**
             * A linked provider may verify the account's exact email after the
             * original link was created. Accept that verification only when the
             * provider email resolves to this same SysUser.
             */
            if (
              profile.emailVerified &&
              matchingUser?.id === linkedUserId &&
              !matchingUser.emailVerified
            ) {
              const source = externalVerificationSource(profile.provider);

              await apiClient.put(
                `/api/v1/internal/SysUsers/${linkedUserId}/email-verified`,
                { source },
                { internal: true },
              );

              securityTokenStore.invalidateEmailVerificationTokens(linkedUserId, source);
            }

            if (
              !profile.emailVerified &&
              matchingUser?.id === linkedUserId &&
              !matchingUser.emailVerified
            ) {
              const verificationToken = securityTokenStore.create(
                linkedUserId,
                'verify-email',
                1440,
              );

              await emailService.sendWelcomeAndVerificationEmail(
                matchingUser,
                absoluteUrl(
                  req,
                  `/auth/verify-email?token=${encodeURIComponent(verificationToken)}`,
                ),
              );

              res.redirect('/?message=verification-sent');

              return;
            }

            try {
              const login = await createTrustedApiSession(
                req,
                linkedUserId,
                `ManatOS Web UI / ${profile.provider}`,
              );

              await establishUiSession(req, login, profile.provider);

              res.redirect('/account');
            } catch (error) {
              if (error instanceof AppError && error.code === 'FORBIDDEN') {
                res.redirect('/?message=verification-sent');

                return;
              }

              throw error;
            }

            return;
          }

          /**
           * If no provider identity exists yet, ensure this email is not
           * already owned by another SysUser.
           */
          const existing = await lookup(profile.email);

          if (existing) {
            /**
             * The provider authenticated successfully, but its identity has not
             * previously been linked to a ManatOS account.
             *
             * The provider supplied an email already owned by an existing SysUser.
             *
             * IMPORTANT:
             *
             * Email equality alone MUST NOT silently link the provider identity.
             * Preserve the provider profile temporarily and require the owner of
             * the existing ManatOS account to authenticate explicitly.
             */
            req.session.pendingExternalLink = {
              ...sessionExternalProfile(profile),

              existingUserId: existing.id,

              existingUserName: existing.name,
            };

            res.redirect('/auth/link/external');

            return;
          }

          req.session.pendingExternalRegistration = sessionExternalProfile(profile);
          req.session.pendingExternalRegistrationIntent = authIntent;

          res.redirect('/auth/register/external');
        } catch (error) {
          next(error);
        }
      },
    );
  }

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
          await apiClient.post<SysUser>(
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

            `Authenticated SysUser ${verifiedUser.id} does not match pending external-link SysUser ${pending.existingUserId}.`,

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
          await apiClient.post<SysUser>(
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
         * Persist normalized provider identity separately from SysUser.
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

function verificationSourceLabel(source: EmailVerificationSource): string {
  if (source === 'internal') {
    return 'ManatOS';
  }

  return externalProviderOption(source)?.label ?? source;
}

/**
 * Internal lookup by unique user-name OR email.
 *
 * Used only before an authenticated Bearer session exists, for:
 *
 * - password recovery;
 * - external-registration duplicate checks.
 */

/**
 * Build a friendly, provider-derived user-name suggestion for a new external
 * account. The suggestion is presentation only: the normal API uniqueness
 * validation remains authoritative when the account is created.
 */
async function suggestExternalUserName(profile: ExternalProfile): Promise<string> {
  const sources = [
    profile.userName,
    profile.displayName,
    [profile.firstName, profile.lastName].filter(Boolean).join(' '),
    profile.email.split('@')[0],
  ];

  const base = sources
    .map((value) => normalizeSuggestedUserName(value ?? ''))
    .find((value) => value.length >= 2) ?? 'User';

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}${suffix + 1}`;
    if (!(await lookup(candidate))) return candidate;
  }

  return `${base}${Date.now().toString().slice(-6)}`;
}

function normalizeSuggestedUserName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
    .slice(0, 80);
}

async function lookup(identity: string): Promise<SysUser | null> {
  return (
    await apiClient.get<SysUser | null>(
      `/api/v1/internal/auth/lookup?identity=${encodeURIComponent(identity)}`,

      {
        internal: true,
      },
    )
  ).data;
}

/**
 * Resolve an existing normalized external provider identity.
 */
async function resolveExternalUserId(profile: ExternalProfile): Promise<string | null> {
  const identity = (
    await apiClient.get<{
      userId: string;
    } | null>(
      `/api/v1/internal/external-identities/resolve?provider=${encodeURIComponent(profile.provider)}&subject=${encodeURIComponent(profile.providerSubject)}`,

      {
        internal: true,
      },
    )
  ).data;

  return identity?.userId ?? null;
}

/**
 * Ask the trusted API bridge to mint an ordinary API session for a SysUser
 * already authenticated by an approved UI mechanism.
 */
async function createTrustedApiSession(
  req: Request,

  userId: string,

  clientName: string,
): Promise<ApiLoginResult> {
  const response = await apiClient.post<ApiLoginResult>(
    '/api/v1/internal/auth/session',

    {
      userId,

      clientName,

      ...(req.get('user-agent')
        ? {
            userAgent: req.get('user-agent'),
          }
        : {}),

      ...(req.ip
        ? {
            ipAddress: req.ip,
          }
        : {}),
    },

    {
      internal: true,
    },
  );

  return response.data;
}

/**
 * Establish the server-side browser/UI session after the API session has
 * successfully been created.
 *
 * Regenerating the Express session ID protects against session fixation.
 */
async function establishUiSession(
  req: Request,

  login: ApiLoginResult,

  authenticationMethod: string,
): Promise<void> {
  await regenerateSession(req);

  req.session.userId = login.user.id;

  req.session.authenticationMethod = authenticationMethod;

  req.session.apiAccessToken = login.accessToken;

  req.session.apiSessionId = login.sessionId;

  req.session.apiExpiresAt = login.expiresAt;
}

/**
 * Regenerate the Express browser session.
 */
function regenerateSession(req: Request): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Build an absolute website URL.
 */
/**
 * Complete an Admin credential-test popup without navigating the dirty editor.
 * Only a status/message cross the window boundary; secret material never does.
 */
function sendProviderCredentialTestResult(
  res: Response,
  status: 'verified' | 'failed',
  message: string,
): void {
  const payload = JSON.stringify({
    type: 'manatos:provider-credential-test-result',
    status,
    message,
  }).replace(/</g, '\\u003c');
  const origin = JSON.stringify(new URL(config.PUBLIC_BASE_URL).origin);

  res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Credential test</title></head>
<body>
  <p style="font-family:system-ui,sans-serif;padding:1.5rem">${status === 'verified' ? 'Credentials verified. Returning to ManatOS…' : 'Credential test failed. Returning to ManatOS…'}</p>
  <script>
    // postMessage is only a fast-path. The Admin editor independently polls
    // the server-side test state, because OAuth/browser opener isolation can
    // sever window.opener during a cross-origin provider round trip.
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(${payload}, ${origin});
    }
    window.setTimeout(() => window.close(), 250);
    window.setTimeout(() => {
      const paragraph = document.querySelector('p');
      if (paragraph) paragraph.textContent = 'Credential test completed. You may close this window and return to ManatOS.';
    }, 1200);
  </script>
</body></html>`);
}

function providerCredentialTestError(error: unknown): string {
  if (!(error instanceof Error)) return 'The provider rejected the proposed credentials or OAuth configuration.';
  const normalized = error.message.replace(/\s+/g, ' ').trim();
  if (/AADSTS7000215|invalid client secret/i.test(normalized)) return 'Microsoft rejected the Client secret. Confirm that you entered the secret Value, not the Secret ID.';
  if (/invalid_client|client credential|client secret/i.test(normalized)) return 'The provider rejected the Client ID / Client secret pair.';
  return normalized.slice(0, 300) || 'The provider rejected the proposed credentials or OAuth configuration.';
}

function absoluteUrl(
  req: Request,

  path: string,
): string {
  return `${req.protocol}://${req.get('host')}${path}`;
}

/**
 * Copy an external profile into the exact temporary Express-session shape.
 *
 * Undefined optional fields are omitted for exactOptionalPropertyTypes.
 */
function sessionExternalProfile(profile: ExternalProfile) {
  return {
    provider: profile.provider,

    providerSubject: profile.providerSubject,

    email: profile.email,

    emailVerified: profile.emailVerified,

    ...(profile.displayName
      ? {
          displayName: profile.displayName,
        }
      : {}),

    ...(profile.userName
      ? {
          userName: profile.userName,
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
  };
}
