import { Router } from 'express';

import { API_IMPLEMENTATION_VERSION, API_VERSION } from '../version.js';
import { sendQuery } from './api-response.js';
import type { SysBOConfigurationService } from '../services/sys-configuration-service.js';
import type { SysBOExtAuthProviderService } from '../services/sys-ext-auth-provider-service.js';

/**
 * Anonymous-safe discovery endpoints consumed by the UI before/around sign-in.
 * Keep this router intentionally limited to data that is safe to expose publicly.
 */
export function createPublicRouter(
  configurations: SysBOConfigurationService,
  extAuthProviders: SysBOExtAuthProviderService,
) {
  const router = Router();

  router.get('/ui-bootstrap', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const value = async (name: string) => configurations.resolve(name);

    sendQuery(res, {
      server: { alive: true, implementationVersion: API_IMPLEMENTATION_VERSION },
      api: { version: API_VERSION },
      ui: {
        pageSizeOptions: ((await value('UI_PAGE_SIZE_OPTIONS')) ?? '2,5,10,20,50,100')
          .split(',')
          .map(Number)
          .filter((n) => Number.isInteger(n) && n > 0),
        defaultPageSize: Number((await value('UI_DEFAULT_PAGE_SIZE')) ?? 10),
        showTechnicalErrorDetails:
          ((await value('SHOW_TECHNICAL_ERROR_DETAILS')) ?? 'false') === 'true',
        sessionErrorLogMaxEntries: Number((await value('SESSION_ERROR_LOG_MAX_ENTRIES')) ?? 20),
        donationsShow: ((await value('DONATIONS_SHOW')) ?? 'false') === 'true',
      },
    });
  });

  router.get('/external-auth-providers', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    sendQuery(res, { providers: await extAuthProviders.publicProviderState() });
  });

  return router;
}
