import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import createError from 'http-errors';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import type { ExternalProviderKey } from '@manatos/shared';

import { apiClient } from './api-client.js';
import { config } from './config.js';
import { passport } from './auth/passport.js';
import { requestContextMiddleware } from './middleware/request-context.js';
import { csrfTokenMiddleware } from './middleware/csrf.js';
import { pageContextMiddleware } from './middleware/page-context.js';
import { createAuthRouter } from './routes/auth-routes.js';
import { createPageRoutes } from './routes/page-routes.js';
import { createSysBORoutes } from './routes/sysbo-routes.js';
import { createDebugRoutes } from './routes/debug-routes.js';
import { createPlatformRoutes } from './platforms/routes.js';
import { uiErrorHandler } from './error-handler.js';
import { refreshUiBootstrap, uiBootstrapState } from './bootstrap/ui-bootstrap.js';


const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(moduleDirectory, '..');
const require = createRequire(import.meta.url);

function packageDirectory(packageName: string): string {
  return dirname(require.resolve(`${packageName}/package.json`));
}

export function createUiApp() {
  const app = express();

  app.disable('x-powered-by');

  if (config.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  app.use(helmet({ contentSecurityPolicy: false }));

  app.set('view engine', 'ejs');
  app.set('views', resolve(uiRoot, 'views'));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  app.get('/favicon.ico', (_req, res) => {
    res.sendFile(resolve(uiRoot, 'public/assets/favicon.ico'));
  });

  app.use('/assets', express.static(resolve(uiRoot, 'public/assets')));
  app.use('/css', express.static(resolve(uiRoot, 'public/css')));
  app.use('/js', express.static(resolve(uiRoot, 'public/js')));

  // Resolve package assets from the package itself rather than process.cwd().
  // This keeps CSS/JS working whether the UI is launched from the workspace
  // root, through npm --workspace, or directly from the ui package.
  app.use('/vendor/bootstrap', express.static(resolve(packageDirectory('bootstrap'), 'dist')));
  app.use('/vendor/bootstrap-icons', express.static(resolve(packageDirectory('bootstrap-icons'), 'font')));

  /**
   * Browser-visible, same-origin projection of the public UI bootstrap state.
   * It contains only values already intended for browser UI configuration.
   * Keeping this on the UI origin avoids exposing API credentials or coupling
   * browser code to the API server address/CORS policy.
   */
  app.get('/runtime/ui-bootstrap', async (_req, res) => {
    /*
     * Force one public refresh before projecting the state to the browser.
     * This removes the startup race where the UI process can still hold its
     * local donationsShow=false fallback after the API has already become
     * available. The browser then receives the real bootstrap value and the
     * existing manatos:ctx-change consumer updates Donate without login/reload.
     */
    await refreshUiBootstrap();
    res.set('Cache-Control', 'no-store');
    res.json(uiBootstrapState());
  });

  /**
   * Anonymous-safe external-authentication provider state for the Sign in and
   * Register popups. Keep this endpoint ahead of session/page-context middleware:
   * a stale authenticated browser session must never prevent the sign-in surface
   * from discovering currently usable providers after an API/server restart.
   */
  app.get('/auth/external-providers', async (_req, res) => {
    res.set('Cache-Control', 'no-store');

    try {
      const response = await apiClient.get<{
        providers: Array<{
          provider: ExternalProviderKey;
          label: string;
          icon: string;
          enabled: boolean;
          configured: boolean;
        }>;
      }>('/api/v1/public/external-auth-providers');

      res.json({ providers: response.data.providers, unavailable: false });
    } catch {
      res.status(503).json({ providers: [], unavailable: true });
    }
  });

  app.use(requestContextMiddleware);

  app.use(
    session({
      name: 'manatos.sid',
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: config.SESSION_IDLE_TIMEOUT_MINUTES * 60_000,
      },
    }),
  );

  app.use(passport.initialize());
  app.use(csrfTokenMiddleware);

  /* Developer diagnostics intentionally bypass rendered-page context hydration. */
  app.use('/bo/debug', createDebugRoutes());

  app.use(pageContextMiddleware);

  app.use('/auth', createAuthRouter());
  app.use('/', createPlatformRoutes());
  app.use('/bo', createSysBORoutes());
  app.use('/', createPageRoutes());

  app.use((_req, _res, next) => next(createError(404, 'The requested page was not found.')));
  app.use(uiErrorHandler);

  return app;
}
