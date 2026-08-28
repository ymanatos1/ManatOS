import 'express-serve-static-core';

import type { AccessTokenContext } from '../auth/access-token-store.js';

declare module 'express-serve-static-core' {
  interface Request {
    /**
     * Authenticated user/session context resolved from the API Bearer token.
     */
    auth?: AccessTokenContext;

    /**
     * Raw Bearer token for operations such as logout.
     *
     * This exists only for the duration of the HTTP request and must never be
     * persisted or returned to callers.
     */
    accessToken?: string;
  }
}
