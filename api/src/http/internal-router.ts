import { Router } from 'express';

import type { IEmailService } from '../email/email-service.js';
import type { ExternalIdentityService, UserPrincipalService } from '../services/index.js';
import type { SysBOExtAuthProviderService } from '../services/sys-ext-auth-provider-service.js';
import type { SysBOUserService } from '../services/sys-user-service.js';
import { createInternalAuthRouter } from './internal/auth-router.js';
import { createInternalEmailRouter } from './internal/email-router.js';
import { createInternalExternalAuthProviderRouter } from './internal/external-auth-provider-router.js';
import { createInternalExternalIdentityRouter } from './internal/external-identity-router.js';
import { createInternalUserAccountRouter } from './internal/user-account-router.js';
import { createInternalUserPrincipalRouter } from './internal/user-principal-router.js';

export interface InternalRouterServices {
  users: SysBOUserService;
  externalIdentities: ExternalIdentityService;
  userPrincipals: UserPrincipalService;
  email: IEmailService;
  extAuthProviders: SysBOExtAuthProviderService;
}

/**
 * Composes trusted UI -> API routes behind one /api/v1/internal security boundary.
 *
 * requireInternalApiKey is intentionally applied by app.ts before this router;
 * subrouters add user/Admin Bearer checks only where credential material needs
 * the additional authenticated administrator boundary.
 */
export function createInternalRouter(services: InternalRouterServices) {
  const router = Router();

  router.use('/email', createInternalEmailRouter(services.users, services.email));
  router.use('/auth', createInternalAuthRouter(services.users));
  router.use(createInternalExternalIdentityRouter(services.externalIdentities));
  router.use(createInternalUserAccountRouter(services.users));
  router.use(createInternalUserPrincipalRouter(services.userPrincipals));
  router.use(
    '/external-auth-providers',
    createInternalExternalAuthProviderRouter(services.extAuthProviders),
  );

  return router;
}
