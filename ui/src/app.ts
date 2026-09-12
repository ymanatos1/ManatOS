import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import createError from 'http-errors';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import type { ExternalProviderKey } from '@manatos/shared';

import { apiClient } from './api/client.js';
import { config } from './config.js';
import { passport } from './auth/passport.js';
import { requestContextMiddleware } from './middleware/request-context.js';
import { csrfTokenMiddleware } from './middleware/csrf.js';
import { pageContextMiddleware } from './middleware/page-context.js';
import { createAuthRouter } from './routes/auth/index.js';
import { createPageRoutes } from './routes/pages/index.js';
import { createSysBORoutes } from './routes/sysbo/index.js';
import { createDebugRoutes } from './routes/debug/index.js';
import { createPlatformRoutes } from './platforms/routes.js';
import { uiErrorHandler } from './middleware/error-handler.js';
import {
  refreshUiBootstrap,
  uiBootstrapRevision,
  uiBootstrapState,
} from './bootstrap/ui-bootstrap.js';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(moduleDirectory, '..');
const require = createRequire(import.meta.url);
/*
 * `@manatos/shared` is ESM-only (`exports.import`) and therefore must be
 * resolved through the ESM resolver. `createRequire().resolve()` asks Node for
 * a CommonJS export condition and fails at dev startup with
 * ERR_PACKAGE_PATH_NOT_EXPORTED even though the package imports normally.
 *
 * The resolved URL points at shared/dist/index.js; serving its directory keeps
 * all relative ES-module imports (for example expressions/parser.js) intact.
 */
const sharedRuntimeRoot = dirname(fileURLToPath(import.meta.resolve('@manatos/shared')));

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

  app.use(express.urlencoded({ extended: true, limit: '16mb' }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/favicon.ico', (_req, res) => {
    res.sendFile(resolve(uiRoot, 'public/assets/m1/favicon.ico'));
  });

  app.use('/assets', express.static(resolve(uiRoot, 'public/assets')));
  app.use('/css', express.static(resolve(uiRoot, 'public/css')));
  // Repository-built browser bundles and their emitted assets live under
  // public/vendor. Serve them from the same /vendor URL space used by package
  // assets so browser imports never fall through to the HTML 404 handler.
  app.use(
    '/vendor',
    express.static(resolve(uiRoot, 'public/vendor'), {
      setHeaders(response) {
        if (config.NODE_ENV !== 'production') response.setHeader('Cache-Control', 'no-store');
      },
    }),
  );
  // Expose browser-safe shared runtime modules (evaluation policy, field policy, etc.).
  // Canonical metadata expressions themselves cross the browser boundary already parsed.
  app.use('/shared-runtime', express.static(sharedRuntimeRoot));
  app.use(
    '/js',
    express.static(resolve(uiRoot, 'public/js'), {
      // During development the UI runtime changes frequently while the browser
      // remains open. Do not let a stale shell.js survive a server restart and
      // mask navigation/runtime fixes behind browser cache behaviour. Production
      // keeps normal static caching semantics.
      setHeaders(response) {
        if (config.NODE_ENV !== 'production') response.setHeader('Cache-Control', 'no-store');
      },
    }),
  );

  // Resolve package assets from the package itself rather than process.cwd().
  // This keeps CSS/JS working whether the UI is launched from the workspace
  // root, through npm --workspace, or directly from the ui package.
  app.use('/vendor/bootstrap', express.static(resolve(packageDirectory('bootstrap'), 'dist')));
  app.use(
    '/vendor/bootstrap-icons',
    express.static(resolve(packageDirectory('bootstrap-icons'), 'font')),
  );

  /**
   * Browser-visible, same-origin projection of the public UI bootstrap state.
   * It contains only values already intended for browser UI configuration.
   * Keeping this on the UI origin avoids exposing API credentials or coupling
   * browser code to the API server address/CORS policy.
   */
  app.get('/runtime/ui-bootstrap', async (_req, res) => {
    /*
     * Only the initial/unavailable state needs an on-demand API refresh. During
     * normal operation the UI process maintains this projection in the
     * background using lightweight /health checks plus infrequent full refreshes.
     */
    if (!uiBootstrapState().server.alive) await refreshUiBootstrap();
    res.set('Cache-Control', 'no-store');
    res.set('X-ManatOS-Bootstrap-Revision', String(uiBootstrapRevision()));
    res.json(uiBootstrapState());
  });

  /**
   * Tiny same-origin heartbeat for the already-loaded browser shell. It never
   * calls the API itself; the UI process owns API liveness polling. This avoids
   * turning every browser heartbeat into another /public/ui-bootstrap trace.
   */
  app.get('/runtime/health', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      alive: uiBootstrapState().server.alive,
      bootstrapRevision: uiBootstrapRevision(),
    });
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

  /** Session-specific authenticated-user CTX projection.
   *
   * This deliberately does not live in the process-wide public UI bootstrap
   * state: authenticated user data is per browser session. The browser bootstrap
   * runtime uses this endpoint after a successful save of the current SysUser.
   */
  app.get('/runtime/current-user-context', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ user: res.locals.ctx?.user ?? null });
  });

  app.use('/auth', createAuthRouter());
  app.use('/', createPlatformRoutes());
  app.use('/bo', createSysBORoutes());
  app.use('/', createPageRoutes());

  app.use((_req, _res, next) => next(createError(404, 'The requested page was not found.')));
  app.use(uiErrorHandler);

  return app;
}
