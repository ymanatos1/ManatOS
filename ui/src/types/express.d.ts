import 'express-session';

import type { ExternalProviderKey, SysUser } from '@manatos/shared';

import type { SessionErrorEntry } from '../errors/session-error-log.js';

declare module 'express-session' {
  interface SessionData {
    /**
     * Website/security SysUser associated with this browser session.
     */
    userId?: string;

    /**
     * Authentication mechanism used to establish the UI/API session.
     *
     * Examples:
     *
     * local
     * google
     * facebook
     * github
     * email-verification
     */
    authenticationMethod?: string;

    /**
     * API Bearer token associated with this website session.
     *
     * IMPORTANT:
     *
     * This is server-side session state only.
     * Never intentionally expose it through:
     *
     * - EJS;
     * - HTML;
     * - browser JavaScript;
     * - localStorage;
     * - browser cookies.
     */
    apiAccessToken?: string;

    /**
     * API AccessTokenStore session/token identifier.
     */
    apiSessionId?: string;

    /**
     * ISO timestamp at which the API Bearer token expires.
     */
    apiExpiresAt?: string;

    /**
     * Session-wide SysBO list page size selected by the user.
     *
     * This is deliberately server-side Express-session state:
     *
     * - shared by all listed SysBO entities;
     * - preserved while the same ManatOS user session remains active;
     * - discarded when that authenticated session ends or is regenerated.
     */
    uiPageSize?: number;

    /**
     * Anti-CSRF token for browser form commands.
     */
    csrfToken?: string;

    /**
     * Bounded UI application-error history.
     */
    errorLog?: SessionErrorEntry[];

    /**
     * Currently selected SysApplication playground.
     */
    activeApplicationId?: string;

    /**
     * Temporary external-provider registration information.
     *
     * This exists only between successful Passport authentication and
     * completion of a NEW SysUser account.
     */
    /** Intent selected before redirecting to an external OAuth provider. */
    externalAuthIntent?: 'signin' | 'register';

    /**
     * Proposed provider credential pair being tested before persistence.
     *
     * Client secret stays in the server-side Express session only. It is never
     * rendered into HTML or browser JavaScript after submission. The verified
     * pair is consumed exactly once by the SysBO Save command.
     */
    pendingExtAuthCredentialTest?: {
      testId: string;
      recordId?: string;
      provider: ExternalProviderKey;
      enabled: boolean;
      clientId: string;
      clientSecret?: string;
      /** True when the credential test is using the pair already persisted for this record. */
      usesStoredCredentials?: boolean;
      /** Version/timestamp of the persisted encrypted secret used by the test. */
      storedSecretUpdatedAt?: string;
      scope: string[];
      callbackPath: string;
      tenant?: string;
      returnPath: string;
      status: 'pending' | 'verified' | 'failed';
      verifiedAt?: string;
      errorMessage?: string;
      createdAt: string;
    };

    /**
     * A registration attempt made with an external identity that is already
     * linked to an existing ManatOS account. The provider has authenticated
     * the identity, but the user must explicitly choose to sign in.
     */
    pendingExternalExistingAccount?: {
      provider: ExternalProviderKey;
      email: string;
      existingUserId: string;
      existingUserName: string;
    };

    pendingExternalRegistrationIntent?: 'signin' | 'register';

    pendingExternalRegistration?: {
      provider: ExternalProviderKey;

      providerSubject: string;

      email: string;

      emailVerified: boolean;

      displayName?: string;

      /**
       * Provider-specific login/user name when available.
       *
       * GitHub, for example, exposes its login separately from the
       * user's free-form display name.
       */
      userName?: string;

      firstName?: string;

      lastName?: string;
    };

    /**
     * External identity waiting to be explicitly linked to an existing
     * ManatOS SysUser.
     *
     * This is deliberately separate from pendingExternalRegistration:
     *
     * - pendingExternalRegistration => provider belongs to a NEW SysUser
     * - pendingExternalLink         => provider must be attached to an
     *                                  EXISTING authenticated SysUser
     */
    pendingExternalLink?: {
      provider: ExternalProviderKey;

      providerSubject: string;

      email: string;

      emailVerified: boolean;

      displayName?: string;

      userName?: string;

      firstName?: string;

      lastName?: string;

      /**
       * Existing SysUser discovered by provider email.
       *
       * This does NOT authenticate that user.
       * The user must still prove ownership of the ManatOS account
       * before the external identity may be linked.
       */
      existingUserId: string;

      existingUserName: string;
    };
  }
}

declare global {
  namespace Express {
    type User = SysUser;

    /**
     * Additional Passport authentication information.
     *
     * External providers normalize their provider-specific profile
     * into ExternalProfile and pass it through Passport's auth-info
     * channel. The provider callback routes can therefore use the
     * same downstream ManatOS authentication flow regardless of
     * whether the provider is Google, Facebook, GitHub, etc.
     */
    interface AuthInfo {
      externalProfile?: import('../auth/external-profile.js').ExternalProfile;
    }
  }
}
