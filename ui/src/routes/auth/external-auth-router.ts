import { Router } from 'express';

import { AppError, EXTERNAL_PROVIDER_KEYS, type ExternalProviderKey } from '@manatos/shared';

import { apiClient } from '../../api/client.js';
import { config } from '../../config.js';
import { apiSessionOptions } from '../../auth/api-session.js';
import { emailService } from '../../email/email-service.js';
import { securityTokenStore } from '../../security/security-token-store.js';
import { configurePassport, passport } from '../../auth/passport.js';
import {
  configureProviderCredentialTest,
  removeProviderCredentialTest,
} from '../../auth/providers/credential-test.js';
import {
  refreshExternalProviderRegistry,
  runtimeProvider,
  externalVerificationSource,
} from '../../auth/providers/runtime-registry.js';
import {
  absoluteUrl,
  createTrustedApiSession,
  establishUiSession,
  lookup,
  providerCredentialTestCallbackError,
  providerCredentialTestError,
  resolveExternalUserId,
  sendProviderCredentialTestResult,
  sessionExternalProfile,
} from './shared.js';

/**
 * External-provider authentication entry points and callback handling.
 *
 * This router owns the provider redirect/callback lifecycle, including
 * credential-test callbacks and resolution of a successful provider profile
 * into the next ManatOS authentication step. The follow-up account-linking and
 * external-registration completion flows are delegated to
 * external-account-router.ts, so public /auth/... URLs and session contracts
 * stay unchanged.
 */
export function createExternalAuthRouter() {
  const router = Router();

  /**
   * Register stable routes for every supported provider key. The provider's
   * current credentials/scopes are loaded from the API immediately before the
   * authentication flow starts, so Admin changes from another client are not
   * hidden behind UI startup state or a TTL cache.
   */
  router.get('/:provider/test-credentials', (req, res, next) => {
    const providerKey = String(req.params.provider ?? '').toLowerCase() as ExternalProviderKey;
    const pending = req.session.pendingExtAuthCredentialTest;
    if (
      !pending ||
      pending.provider !== providerKey ||
      pending.status !== 'pending' ||
      Date.now() - Date.parse(pending.createdAt) > 10 * 60 * 1000
    ) {
      sendProviderCredentialTestResult(
        res,
        'failed',
        'The provider credential test expired. Return to the ManatOS editor and test the credentials again.',
      );
      return;
    }
    try {
      const strategyName = configureProviderCredentialTest({
        testId: pending.testId,
        provider: pending.provider,
        clientId: pending.clientId,
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

          req.session.externalAuthIntent = req.query.intent === 'register' ? 'register' : 'signin';

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
        const stateTestId = credentialTestState.startsWith(credentialTestPrefix)
          ? credentialTestState.slice(credentialTestPrefix.length)
          : null;
        const pendingTestIsFresh = Boolean(
          pendingTest &&
          pendingTest.provider === providerKey &&
          pendingTest.status === 'pending' &&
          Date.now() - Date.parse(pendingTest.createdAt) <= 10 * 60 * 1000,
        );
        const callbackTestId =
          stateTestId ?? (pendingTestIsFresh ? (pendingTest?.testId ?? null) : null);

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

          /*
           * OAuth providers may return a standards-based error directly to the
           * registered callback instead of invoking Passport's token exchange.
           * Capture that provider response in the authoritative pending-test
           * state so the Admin editor can display it immediately through its
           * normal polling channel.
           */
          const callbackError = String(req.query.error ?? '').trim();
          if (callbackError) {
            pendingTest.status = 'failed';
            pendingTest.errorMessage = providerCredentialTestCallbackError(
              providerKey,
              callbackError,
              String(req.query.error_description ?? '').trim(),
            );
            console.warn(
              `[AUTH] ${pendingTest.provider} credential test callback rejected: ${pendingTest.errorMessage}`,
            );
            sendProviderCredentialTestResult(res, 'failed', pendingTest.errorMessage);
            return;
          }

          const strategyName = configureProviderCredentialTest({
            testId: pendingTest.testId,
            provider: pendingTest.provider,
            clientId: pendingTest.clientId,
            clientSecret: pendingTest.clientSecret ?? '',
            callbackUrl: new URL(pendingTest.callbackPath, config.PUBLIC_BASE_URL).toString(),
            ...(pendingTest.tenant ? { tenant: pendingTest.tenant } : {}),
          });
          passport.authenticate(
            strategyName,
            { session: false },
            async (error: unknown, user: Express.User | false | null) => {
              removeProviderCredentialTest(strategyName);
              if (error || !user) {
                pendingTest.status = 'failed';
                pendingTest.errorMessage = providerCredentialTestError(error);
                console.warn(
                  `[AUTH] ${pendingTest.provider} credential test failed: ${pendingTest.errorMessage}`,
                );
              } else {
                try {
                  if (
                    pendingTest.usesStoredCredentials &&
                    pendingTest.recordId &&
                    pendingTest.storedSecretUpdatedAt
                  ) {
                    const verified = await apiClient.post<{ credentialsVerifiedAt?: string }>(
                      `/api/v1/internal/external-auth-providers/${encodeURIComponent(pendingTest.recordId)}/credentials-verified`,
                      {
                        clientId: pendingTest.clientId,
                        secretUpdatedAt: pendingTest.storedSecretUpdatedAt,
                      },
                      { ...apiSessionOptions(req), internal: true },
                    );
                    pendingTest.verifiedAt = String(
                      verified.data.credentialsVerifiedAt ?? new Date().toISOString(),
                    );
                    // The persisted pair is now verified; no pending plaintext
                    // secret needs to survive until a separate Save action.
                    delete pendingTest.clientSecret;
                  } else {
                    pendingTest.verifiedAt = new Date().toISOString();
                  }
                  pendingTest.status = 'verified';
                  delete pendingTest.errorMessage;
                } catch (verificationCommitError) {
                  pendingTest.status = 'failed';
                  pendingTest.errorMessage =
                    verificationCommitError instanceof Error
                      ? verificationCommitError.message
                      : 'The stored credentials passed the provider test but could not be marked verified.';
                }
              }
              sendProviderCredentialTestResult(
                res,
                pendingTest.status,
                pendingTest.status === 'verified'
                  ? pendingTest.usesStoredCredentials
                    ? 'Stored provider credentials tested successfully and are now verified.'
                    : 'Provider credentials tested successfully. They are ready to save.'
                  : (pendingTest.errorMessage ?? 'The provider rejected the proposed credentials.'),
              );
            },
          )(req, res, next);
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
                existingUserName: matchingUser?.name ?? profile.displayName ?? profile.email,
              };

              res.redirect('/auth/register/existing-external');

              return;
            }

            /**
             * A linked provider may verify the account's exact email after the
             * original link was created. Accept that verification only when the
             * provider email resolves to this same SysBOUser.
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
           * already owned by another SysBOUser.
           */
          const existing = await lookup(profile.email);

          if (existing) {
            /**
             * The provider authenticated successfully, but its identity has not
             * previously been linked to a ManatOS account.
             *
             * The provider supplied an email already owned by an existing SysBOUser.
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

  return router;
}
