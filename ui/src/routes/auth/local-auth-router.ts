import { Router } from 'express';

import { AppError, operationContext, validatePassword, type SysBOUser } from '@manatos/shared';

import { apiClient } from '../../api/client.js';
import { emailService } from '../../email/email-service.js';
import { securityTokenStore } from '../../security/security-token-store.js';
import { isRecoveryIdentitySyntaxValid } from '../../auth/recovery-identity.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { renderPage } from '../../presentation/render-page.js';
import {
  absoluteUrl,
  createTrustedApiSession,
  establishUiSession,
  lookup,
  verificationSourceLabel,
  type ApiLoginResult,
} from './shared.js';

/**
 * Local-account authentication lifecycle.
 *
 * Keeping these routes together makes the ownership boundary explicit without
 * changing any public URL: sign-in, registration, email verification, password
 * recovery and logout all remain mounted under the parent /auth router.
 */
export function createLocalAuthRouter() {
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
              await apiClient.post<SysBOUser>(
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
               * The SysBOUser has already been created successfully at this
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
   * authenticated yet and therefore cannot query protected SysBOUsers.
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
          await apiClient.put<SysBOUser>(
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

  return router;
}
