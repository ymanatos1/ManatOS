import { Router } from 'express';

import { createExternalAccountRouter } from './auth/external-account-router.js';
import { createExternalAuthRouter } from './auth/external-auth-router.js';
import { createLocalAuthRouter } from './auth/local-auth-router.js';

/**
 * Website authentication route composer.
 *
 * Authentication implementation is deliberately split by cohesive lifecycle:
 *
 * - local-auth-router.ts owns local sign-in/registration/password flows;
 * - external-auth-router.ts owns provider authentication and callback handling;
 * - external-account-router.ts owns the explicit account-linking and external
 *   registration completion flows that follow a successful provider callback.
 *
 * Keep this file thin. Cross-flow helpers belong in auth/shared.ts rather than
 * being reintroduced into the top-level composer.
 */
export function createAuthRouter() {
  const router = Router();

  router.use(createLocalAuthRouter());
  router.use(createExternalAuthRouter());
  router.use(createExternalAccountRouter());

  return router;
}
