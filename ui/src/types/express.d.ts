import 'express-session';

import type { SysUser } from '@manatos/shared';

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
    pendingExternalRegistration?: {
      provider: string;

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
      provider: string;

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
      externalProfile?: import('../auth/passport.js').ExternalProfile;
    }
  }
}
