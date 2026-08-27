import type { RequestHandler } from 'express';

import { MANATOS_COMPANY, resolvePlatform, type SysApplication, type SysUser } from '@manatos/shared';

import { config } from '../config.js';

import { uiBootstrapState } from '../bootstrap/ui-bootstrap.js';

import { apiClient } from '../api-client.js';

import { apiSessionOptions, clearApiSession, isApiSessionExpired } from '../auth/api-session.js';

import { navigationFor } from '../navigation.js';

import { buildRootScope } from '../scopes.js';

import { effectiveSysBODefinitions } from '../sysbo/definitions.js';


/**
 * Supplies the complete SysBO definitions and scope tree to every EJS page
 * through:
 *
 *   res.locals.app
 */
export const pageContextMiddleware: RequestHandler = async (req, res, next) => {
  try {
    let user: SysUser | null = null;

    let activeApplication: SysApplication | undefined;

    /**
     * If a browser session still contains a userId but its corresponding
     * API token has disappeared or already passed its known expiration,
     * the UI/API bridge is no longer authenticated.
     */
    if (req.session.userId && (!req.session.apiAccessToken || isApiSessionExpired(req))) {
      clearApiSession(req);

      res.redirect('/?auth=signin&message=session-expired');

      return;
    }

    /**
     * Resolve the currently authenticated website SysUser through the
     * protected API using the server-side Bearer token.
     */
    if (req.session.userId) {
      user = (
        await apiClient.get<SysUser>(
          `/api/v1/SysUsers/${req.session.userId}`,

          apiSessionOptions(req),
        )
      ).data;
    }

    /**
     * Resolve the currently selected application/playground scope.
     */
    if (req.session.activeApplicationId) {
      if (!user) {
        delete req.session.activeApplicationId;
      } else {
        activeApplication = (
          await apiClient.get<SysApplication>(
            `/api/v1/SysApplications/${req.session.activeApplicationId}`,

            apiSessionOptions(req),
          )
        ).data;
      }
    }

    const currentPlatform = resolvePlatform(MANATOS_COMPANY);

    res.locals.currentUser = user;

    // Anonymous/auth-entry presentation starts from the safe local default: no providers.
    // Sign in/Register refresh current provider state on demand.
    res.locals.authProviders = [];

    res.locals.app = Object.freeze({
      version: '0.1.0',

      /** Shared, UI-neutral company/platform catalogue. */
      company: MANATOS_COMPANY,
      currentPlatform,

      scopes: buildRootScope(req, user, activeApplication, config.SESSION_IDLE_TIMEOUT_MINUTES),

      sysBO: effectiveSysBODefinitions(MANATOS_COMPANY, currentPlatform),

      navigation: navigationFor(
        user?.role ?? null,

        Boolean(user),
        MANATOS_COMPANY,
        currentPlatform,
      ),

      /**
       * Small, explicitly exposed UI configuration surface.
       *
       * Do not expose the complete server config object to templates: it
       * contains secrets and server-only settings. Only values that the
       * browser actually needs belong here.
       */
      ui: Object.freeze({
        navigationStatePersistence: config.UI_NAVIGATION_STATE_PERSISTENCE,

        allowAdminEmailVerification: config.ALLOW_ADMIN_EMAIL_VERIFICATION,

        bootstrap: uiBootstrapState(),
      }),
    });

    next();
  } catch (error) {
    /**
     * A revoked/expired Bearer token reaches the central UI error handler,
     * which clears authentication and redirects to sign-in.
     */
    next(error);
  }
};
