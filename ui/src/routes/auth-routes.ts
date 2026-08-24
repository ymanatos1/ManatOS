import { Router, type Request } from 'express';

import {
  AppError,
  operationContext,
  validatePassword,
  type EmailVerificationSource,
  type SysUser,
} from '@manatos/shared';

import { apiClient } from '../api-client.js';

import { emailService } from '../email/email-service.js';

import { securityTokenStore } from '../security/security-token-store.js';

import { passport, configuredProviders, type ExternalProfile } from '../auth/passport.js';

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

            await emailService.sendWelcomeAndVerificationEmail(
              user,

              absoluteUrl(
                req,

                `/auth/verify-email?token=${encodeURIComponent(token)}`,
              ),
            );

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
        const user = await lookup(String(req.body.identity ?? ''));

        if (user) {
          const token = securityTokenStore.create(user.id, 'reset-password', 30);

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

      res.redirect('/?message=password-instructions');
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

        await emailService.sendPasswordChangedEmail(user);

        res.redirect('/?message=password-changed');
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
   * Register configured external authentication providers.
   */
  for (const provider of configuredProviders()) {
    router.get(
      `/${provider.key}`,

      passport.authenticate(
        provider.key,

        {
          session: false,

          ...(provider.scope?.length
            ? {
                scope: provider.scope,
              }
            : {}),
        },
      ),
    );

    router.get(
      `/${provider.key}/callback`,

      passport.authenticate(
        provider.key,

        {
          session: false,

          failureRedirect: '/?auth=failed',
        },
      ),

      async (req, res, next) => {
        try {
          const profile = req.authInfo?.externalProfile;

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

          res.redirect('/auth/register/external');
        } catch (error) {
          next(error);
        }
      },
    );
  }

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
        console.log('[external-link] STAGE 1 - verify-local starting', {
          identity,
          pendingUserId: pending.existingUserId,
          pendingUserName: pending.existingUserName,
          provider: pending.provider,
          providerEmail: pending.email,
          providerEmailVerified: pending.emailVerified,
        });

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

        console.log('[external-link] STAGE 1 - verify-local succeeded', {
          verifiedUserId: verifiedUser.id,
          verifiedUserName: verifiedUser.name,
          verifiedUserEmail: verifiedUser.email,
          verifiedUserEmailVerified: verifiedUser.emailVerified,
        });

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
        console.log('[external-link] STAGE 2 - external identity link starting', {
          userId: verifiedUser.id,
          provider: pending.provider,
          providerSubject: pending.providerSubject,
        });

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

        console.log('[external-link] STAGE 2 - external identity link succeeded');

        /**
         * External authentication and external email verification are separate
         * facts. If the provider explicitly verified this exact email, accept
         * that as verification provenance for the matching ManatOS account and
         * invalidate outstanding internal verification links.
         */
        if (pending.emailVerified) {
          const source = externalVerificationSource(pending.provider);

          console.log('[external-link] STAGE 3 - email verification starting', {
            userId: verifiedUser.id,
            source,
          });

          await apiClient.put(
            `/api/v1/internal/SysUsers/${verifiedUser.id}/email-verified`,
            { source },
            { internal: true },
          );

          console.log('[external-link] STAGE 3 - email verification succeeded');

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

        console.log('[external-link] STAGE 4 - trusted API session starting', {
          userId: verifiedUser.id,
        });

        const login = await createTrustedApiSession(
          req,
          verifiedUser.id,
          `ManatOS Web UI / ${pending.provider}`,
        );

        console.log('[external-link] STAGE 4 - trusted API session succeeded', {
          sessionUserId: login.user.id,
          sessionUserName: login.user.name,
        });

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

          res.redirect('/account');

          return;
        }

        delete req.session.pendingExternalRegistration;

        res.redirect('/?message=verification-sent');
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

function externalVerificationSource(provider: string): EmailVerificationSource {
  const normalized = provider.toLowerCase();

  if (normalized === 'google' || normalized === 'facebook' || normalized === 'github') {
    return normalized;
  }

  return 'internal';
}

function verificationSourceLabel(source: EmailVerificationSource): string {
  switch (source) {
    case 'google':
      return 'Google';
    case 'facebook':
      return 'Facebook';
    case 'github':
      return 'GitHub';
    default:
      return 'ManatOS';
  }
}

/**
 * Internal lookup by unique user-name OR email.
 *
 * Used only before an authenticated Bearer session exists, for:
 *
 * - password recovery;
 * - external-registration duplicate checks.
 */
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
