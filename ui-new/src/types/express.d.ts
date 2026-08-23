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
     * completion of a new SysUser account.
     */
    pendingExternalRegistration?: {
      provider: string;

      providerSubject: string;

      email: string;

      emailVerified: boolean;

      displayName?: string;

      firstName?: string;

      lastName?: string;
    };
  }
}

declare global {
  namespace Express {
    interface User extends SysUser {}

    interface AuthInfo {
      externalProfile?: import('../auth/passport.js').ExternalProfile;
    }
  }
}
