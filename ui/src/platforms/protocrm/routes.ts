import { Router } from 'express';

import { apiClient } from '../../api/client.js';
import { apiSessionOptions } from '../../auth/api-session.js';
import { requireSignedIn } from '../../middleware/auth.js';
import { renderPage } from '../../presentation/render-page.js';
import { getSysBODefinition } from '../../sysbo/definitions.js';
import { requirePermission, resolveUIEntityPermissions } from '../../sysbo/permissions.js';
import { requireCurrentPlatformEntitlement } from '../access.js';

const routeParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');

/**
 * protoCRM-owned UI feature routes.
 *
 * Keeping platform features here prevents generic page/SysBO routers from
 * accumulating product-specific branches as more ManatOS platforms arrive.
 */
export function createProtoCrmRoutes() {
  const router = Router();

  router.get(
    '/app-playground',
    requireSignedIn,
    requireCurrentPlatformEntitlement,
    async (_req, res, next) => {
      try {
        await renderPage(res, 'pages/platforms/protocrm/app-playground', {
          title: 'Apps Playground',
          titleIcon: 'bi-play-circle-fill',
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    '/bo/sys-applications/:id/play',
    requireSignedIn,
    requireCurrentPlatformEntitlement,
    async (req, res, next) => {
      try {
        const id = routeParam(req.params.id);
        const definition = getSysBODefinition('sys-applications');
        const permissions = await resolveUIEntityPermissions(req, definition, id);
        requirePermission(permissions.read, 'Read access is required for applications.');

        req.session.activeApplicationId = id;
        const application = (
          await apiClient.get<Record<string, unknown>>(
            `/api/v1/SysApplications/${id}`,
            apiSessionOptions(req),
          )
        ).data;

        await renderPage(res, 'pages/platforms/protocrm/application-playground', {
          title: `${String(application.name)} Playground`,
          application,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
