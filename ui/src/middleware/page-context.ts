import type { RequestHandler } from 'express';

import { MANATOS_COMPANY, SysBOUserRole, allManatOSObjectMetadata, licenseGrantsPlatformAccess, resolvePlatform, type SysBOApplication, type SysBOLicense, type SysBOUser } from '@manatos/shared';

import { config } from '../config.js';

import { uiBootstrapState } from '../bootstrap/ui-bootstrap.js';

import { apiClient } from '../api-client.js';

import { apiSessionOptions, clearApiSession, isApiSessionExpired } from '../auth/api-session.js';

import { navigationFor } from '../navigation.js';

import { buildRootScope } from '../scopes.js';

import { effectiveSysBODefinitions } from '../sysbo/definitions.js';
import { createManatOSContext, registerContextEntity } from '../context/manatos-context.js';

interface LicenseListData {
  items: SysBOLicense[];
  paging: { total: number; page: number; pageSize: number; totalPages: number };
}


/**
 * Supplies the complete SysBO definitions and scope tree to every EJS page
 * through:
 *
 *   res.locals.app
 */
export const pageContextMiddleware: RequestHandler = async (req, res, next) => {
  try {
    let user: SysBOUser | null = null;

    let activeApplication: SysBOApplication | undefined;

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
     * Resolve the currently authenticated website SysBOUser through the
     * protected API using the server-side Bearer token.
     */
    if (req.session.userId) {
      if (req.session.currentUserSnapshot?.id === req.session.userId) {
        user = req.session.currentUserSnapshot;
      } else {
        // Compatibility path for a pre-existing authenticated Express session
        // created before currentUserSnapshot was introduced. Resolve once, then
        // keep the authoritative API result with this server-side session.
        user = (
          await apiClient.get<SysBOUser>(
            `/api/v1/SysUsers/${req.session.userId}`,

            apiSessionOptions(req),
          )
        ).data;
        req.session.currentUserSnapshot = user;
      }
    }

    /**
     * Resolve the currently selected application/playground scope.
     */
    if (req.session.activeApplicationId) {
      if (!user) {
        delete req.session.activeApplicationId;
      } else {
        activeApplication = (
          await apiClient.get<SysBOApplication>(
            `/api/v1/SysApplications/${req.session.activeApplicationId}`,

            apiSessionOptions(req),
          )
        ).data;
      }
    }

    const currentPlatform = resolvePlatform(MANATOS_COMPANY);

    /**
     * Platform functionality is entitlement driven for non-Admin users. The API
     * returns only licenses related to this user's principals, so the UI can
     * derive menu visibility from the same shared license semantics without
     * receiving another customer's license rows.
     */
    let resolvedPlatformAccess = user?.role === SysBOUserRole.Admin;
    if (user && !resolvedPlatformAccess) {
      const licenses = (
        await apiClient.get<LicenseListData>(
          '/api/v1/SysLicenses?pageSize=1000',
          apiSessionOptions(req),
        )
      ).data.items;

      resolvedPlatformAccess = licenses.some((license) =>
        licenseGrantsPlatformAccess(license, currentPlatform.id),
      );
    }

    res.locals.currentUser = user;

    // Typed ManatOS runtime/evaluation context. Every rendered page receives
    // this root even when the route has not attached a page-specific branch.
    res.locals.ctx = createManatOSContext(
      MANATOS_COMPANY,
      currentPlatform,
      config.API_BASE_URL,
      '0.1.0',
      user,
      {
        // Only safe, browser-relevant feature facts belong in CTX. Expressions
        // can now resolve this without templates duplicating config branches.
        allowAdminEmailVerification: config.ALLOW_ADMIN_EMAIL_VERIFICATION,
      },
      'sys',
      config.NODE_ENV,
      {
        platformAccess: Boolean(resolvedPlatformAccess),
      },
    );

    /*
     * ctx.entities is the complete canonical object/entity registry, not the
     * navigation/exposure catalogue. Internal contact objects and relationship
     * entities therefore remain discoverable by CTX/evaluator/debugging clients
     * even when they intentionally have no top-level Administration page.
     * Route-owned UI metadata loaded later may enrich the matching CTX entry.
     */
    for (const metadata of Object.values(allManatOSObjectMetadata)) {
      registerContextEntity(res.locals.ctx, metadata.key, metadata);
    }

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
        { ctx: res.locals.ctx },
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

        /** Developer inspector is never rendered in production. */
        debugTools: res.locals.ctx.system.runtime.developerMode,

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
