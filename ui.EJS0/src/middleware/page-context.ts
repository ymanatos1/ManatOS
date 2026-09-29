import type { RequestHandler } from 'express';

import {
  MANATOS_COMPANY,
  allManatOSObjectMetadata,
  effectiveObjectKeys,
  resolvePlatform,
  sysBOUsersMetadata,
  type EntityCollectionAuthorizationCapabilities,
  type PlatformAuthorizationCapabilities,
  type SysBOApplication,
  type SysBOUser,
} from '@manatos/shared';

import { config } from '../config.js';

import { uiBootstrapState } from '../bootstrap/ui-bootstrap.js';

import { apiClient } from '../api/client.js';

import { apiSessionOptions, clearApiSession, isApiSessionExpired } from '../auth/api-session.js';

import { navigationFor } from '../navigation.js';

import { buildRootScope } from '../context/root-scope.js';

import { effectiveSysBODefinitions } from '../sysbo/definitions.js';
import { createManatOSContext, registerContextEntity } from '../context/manatos-context.js';
import { materializeCalculatedContextFields } from '../runtime/projection/calculated-record-projector.js';

/**
 * The browser V2 host owns runtime UI topology. This middleware supplies only
 * root facts/metadata needed by that client runtime; it deliberately does not
 * manufacture a server-side ctx.ui tree.
 */

/**
 * Supplies the complete SysBO definitions and scope tree to every EJS page
 * through:
 *
 *   res.locals.app
 */
const contextFreeUiRuntimePaths = new Set([
  '/bo/expression/compile',
  '/bo/expression/evaluate-function',
]);

/**
 * Browser expression-runtime requests are authenticated transport operations, not
 * rendered UI surfaces. Hydrating the complete page CTX for each parse/evaluate
 * request caused an authoritative capability projection API call per expression,
 * multiplying entry-opening traffic without contributing any data to the response.
 *
 * Keep this list deliberately narrow: routes that render, mutate through CTX, or
 * otherwise consume res.locals.ctx must continue through normal page hydration.
 */
export function requiresPageContext(path: string): boolean {
  return !contextFreeUiRuntimePaths.has(path);
}

export const pageContextMiddleware: RequestHandler = async (req, res, next) => {
  if (!requiresPageContext(req.path)) {
    next();
    return;
  }

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
     * Platform entitlement is resolved authoritatively by the API. The UI
     * receives only the safe capability outcome; it does not fetch licenses,
     * traverse principal relationships, or reproduce Admin bypass rules.
     */
    let platformCapabilities: PlatformAuthorizationCapabilities = { platformAccess: false };
    let entityCapabilities: EntityCollectionAuthorizationCapabilities = {};
    if (user) {
      const capabilityResponse = await apiClient.get<{
        platformId: string;
        platformCapabilities: PlatformAuthorizationCapabilities;
        entities: EntityCollectionAuthorizationCapabilities;
      }>(
        `/api/v1/authorization/context/${encodeURIComponent(currentPlatform.id)}/$capabilities`,
        apiSessionOptions(req),
      );
      platformCapabilities = capabilityResponse.data.platformCapabilities;
      entityCapabilities = capabilityResponse.data.entities;
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
      platformCapabilities,
    );

    /*
     * ctx.entities is the complete canonical registry for the effective subsystem
     * composition, not merely the navigation/exposure catalogue. Internal objects
     * and relationship entities remain discoverable when their owning subsystem and
     * declared relationship dependencies are selected. Route-owned UI metadata may
     * enrich the matching CTX entry later.
     */
    const effectiveObjects = effectiveObjectKeys(MANATOS_COMPANY, currentPlatform);
    const effectiveDefinitions = effectiveSysBODefinitions(MANATOS_COMPANY, currentPlatform);
    for (const metadata of Object.values(allManatOSObjectMetadata)) {
      if (effectiveObjects.has(metadata.key))
        registerContextEntity(
          res.locals.ctx,
          metadata.key,
          metadata,
          undefined,
          effectiveDefinitions[metadata.key]?.icon,
        );
    }

    if (res.locals.ctx.user) {
      await materializeCalculatedContextFields(
        sysBOUsersMetadata,
        res.locals.ctx,
        res.locals.ctx.user.fields,
        {
          source: 'renderer',
          sourcePath: 'ctx.user',
          purpose: 'materialize authenticated-user calculated fields before CTX publication',
        },
      );
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
        { ctx: res.locals.ctx, entityCapabilities },
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
