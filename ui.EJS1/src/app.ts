import { renderSurfaceTitleDebuggerTools } from '@manatos/shared-ui-ejs';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import express, { type Express } from 'express';

import type { Ejs1Config } from './config.js';
import { createEjs1AuthRouter } from './auth-router.js';

import {
  multilingual,
  ApplicationState,
  DEFAULT_UI_THEME,
  createTransientUiStateRuntime,
  UI_DOCUMENTATION_PAGE,
  UI_ERROR_PAGE,
  UI_NOT_FOUND_PAGE,
  UI_ERROR_PAGE_PRESENTATION,
  UI_NOT_FOUND_PAGE_PRESENTATION,
  createUiPageContext,
  renderUiPage,
  resolveUiPageRoute,
  isUiListPageRoute,
  isUiEntryPageRoute,
  isUiEntityPageRoute,
  uiPageStylesheetUrl,
  uiPageTitle,
  getUiPlatforms,
  uiFieldBehavior,
  resolveUiPlatformIdentity,
} from '@manatos/shared-ui';
import { NodeUiPageContentSource, RepositoryDocumentationSource } from '@manatos/shared-ui/node';

import {
  renderPageHost,
  renderListPageHost,
  renderEntryPageHost,
  renderConfigurationPageHost,
  renderStoragePageHost,
  renderPlatformSelector,
  renderPage as renderPageComponent,
  renderDebugger,
  renderFooter,
  renderHeader,
  renderHeaderStatus,
  renderPrimaryNavigation,
  renderShell,
  renderWorkspace,
  renderWorkspaceNavigation,
  renderPreferences,
  renderSurfaceAction,
} from '@manatos/shared-ui-ejs';

const uiRoot = fileURLToPath(new URL('../', import.meta.url));
const sharedUiEjsStylesRoot = fileURLToPath(
  new URL('../../shared.UI.EJS/assets/styles/', import.meta.url),
);
// Bootstrap CSS is hosted locally, without loading Bootstrap JavaScript.
const bootstrapStylesRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../node_modules/bootstrap/dist/css',
);
const bootstrapIconsRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../node_modules/bootstrap-icons/font',
);

const clientRuntimeLog = resolve(process.cwd(), '../data/logs/client/ui-ejs1-runtime.jsonl');

const proxyRequestHeaderNames = new Set([
  'accept',
  'accept-language',
  'authorization',
  'content-type',
  'cookie',
  'x-manatos-diagnostics',
  'x-manatos-transaction-id',
  'x-request-id',
]);

const proxyResponseHeaderNames = new Set([
  'cache-control',
  'content-type',
  'etag',
  'expires',
  'location',
  'retry-after',
  'x-manatos-transaction-id',
  'x-request-id',
]);

function createProxyRequestHeaders(request: express.Request): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    const normalized = name.toLowerCase();
    if (!proxyRequestHeaderNames.has(normalized)) continue;
    if (value == null) continue;
    // Generic proxy callers may provide their own API credentials. The EJS1
    // HttpOnly UI-host session cookie, however, must never reach the API.
    if (normalized === 'cookie') {
      const forwarded = (Array.isArray(value) ? value.join('; ') : String(value))
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part && !/^manatos_ejs1_auth\s*=/i.test(part));
      if (forwarded.length) headers.set(name, forwarded.join('; '));
      continue;
    }
    headers.set(name, Array.isArray(value) ? value.join(', ') : String(value));
  }
  if (!headers.has('accept')) headers.set('accept', 'application/json');
  return headers;
}

function copyProxyResponseHeaders(upstream: Response, response: express.Response): void {
  upstream.headers.forEach((value, name) => {
    const normalized = name.toLowerCase();
    if (!proxyResponseHeaderNames.has(normalized)) return;
    response.setHeader(name, value);
  });

  // The host's HttpOnly session is not an upstream API session. Never relay
  // API Set-Cookie headers into the trusted EJS1 browser origin.
}

function createInitialApplicationState(): ApplicationState {
  return new ApplicationState('EJS', '1', createTransientUiStateRuntime());
}

function appendClientRuntimeDiagnostic(event: unknown): void {
  mkdirSync(dirname(clientRuntimeLog), { recursive: true });

  appendFileSync(
    clientRuntimeLog,
    `${JSON.stringify({
      receivedAt: new Date().toISOString(),
      event,
    })}\n`,
    'utf8',
  );
}

async function proxyApiRequest(
  request: express.Request,
  response: express.Response,
  apiBaseUrl: string,
): Promise<void> {
  const target = `${apiBaseUrl}${request.originalUrl}`;

  try {
    const headers = createProxyRequestHeaders(request);

    const init: RequestInit = {
      method: request.method,
      headers,
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = JSON.stringify(request.body ?? {});
    }

    const upstream = await fetch(target, init);

    response.status(upstream.status);

    copyProxyResponseHeaders(upstream, response);

    response.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    response.status(503).json({
      success: false,
      errorMessage: 'API unavailable.',
      error: {
        code: 'API_UNAVAILABLE',
        message: 'API unavailable.',
        retryable: true,
      },
    });
  }
}

function requestRelativePath(request: express.Request): string {
  const pathname = new URL(request.url, 'http://manatos.local').pathname;
  return pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
    .join('/');
}
function resourceFailureStatus(error: unknown): number {
  if (error instanceof Error && /Invalid|Unsupported/.test(error.message)) {
    return 403;
  }
  if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    return 404;
  }
  if (error instanceof Error && /not found/i.test(error.message)) {
    return 404;
  }
  return 500;
}

export function createUiApp(
  config: Pick<Ejs1Config, 'nodeEnv' | 'apiBaseUrl' | 'documentationRepositoryRoot'> &
    Partial<Pick<Ejs1Config, 'authDelegationSecret' | 'internalApiKey' | 'publicBaseUrl'>>,
): Express {
  const app = express();

  const pageSource = new NodeUiPageContentSource();
  const documentationSource = new RepositoryDocumentationSource(config.documentationRepositoryRoot);

  app.disable('x-powered-by');

  app.set('view engine', 'ejs');
  app.set('views', resolve(uiRoot, 'views'));

  app.use(express.json({ limit: '2mb' }));

  // Identity/session transport is served exclusively on the same-origin host.
  // No API bearer token or delegation secret is exposed to the browser.
  if (config.authDelegationSecret) {
    const authRouter = createEjs1AuthRouter(
      { ...config, uiPort: 0, publicBaseUrl: config.publicBaseUrl ?? undefined } as Ejs1Config,
      (oauthRouter) => app.use('/auth/oauth', oauthRouter),
    );
    app.use('/_manatos/auth', authRouter);
    // Protect direct HTTP entity-page requests before the SSR catch-all.
    app.use(['/bo', '/configuration', '/system-settings'], authRouter.requireProtectedPage);
  }

  app.get('/favicon.ico', (_request, response) => {
    response.sendFile(resolve(uiRoot, 'public/assets/m1/favicon.ico'));
  });

  app.use(express.static(resolve(uiRoot, 'public')));
  app.use('/vendor/bootstrap/css', express.static(bootstrapStylesRoot));
  app.use('/vendor/bootstrap-icons', express.static(bootstrapIconsRoot));
  app.use('/shared-ui-ejs/styles', express.static(sharedUiEjsStylesRoot));

  app.use('/_manatos/pages', async (request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return next();
    }

    try {
      const resource = await pageSource.readServedResource(requestRelativePath(request));

      if (config.nodeEnv !== 'production') {
        response.set('Cache-Control', 'no-store');
      }

      response.set('Content-Type', resource.contentType).send(Buffer.from(resource.content));
    } catch (error) {
      response.sendStatus(resourceFailureStatus(error));
    }
  });

  app.get('/_manatos/documentation/tree', async (_request, response) => {
    try {
      if (config.nodeEnv !== 'production') {
        response.set('Cache-Control', 'no-store');
      }

      response.json({
        items: await documentationSource.getTree(),
      });
    } catch {
      response.sendStatus(500);
    }
  });

  app.use('/_manatos/documentation/resource', async (request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return next();
    }

    try {
      const resource = await documentationSource.read(requestRelativePath(request));

      if (config.nodeEnv !== 'production') {
        response.set('Cache-Control', 'no-store');
      }

      response.set('x-manatos-documentation-type', resource.resourceType);

      response.set('Content-Type', resource.contentType).send(Buffer.from(resource.content));
    } catch (error) {
      response.sendStatus(resourceFailureStatus(error));
    }
  });

  app.use(
    '/dist',
    express.static(resolve(uiRoot, 'public/dist'), {
      setHeaders(response) {
        if (config.nodeEnv !== 'production') {
          response.setHeader('Cache-Control', 'no-store');
        }
      },
    }),
  );

  app.all('/api/*path', (request, response) => {
    void proxyApiRequest(request, response, config.apiBaseUrl);
  });

  app.all('/health', (request, response) => {
    void proxyApiRequest(request, response, config.apiBaseUrl);
  });

  app.post('/debug/ui-runtime/diagnostic', (request, response) => {
    if (config.nodeEnv === 'production') {
      response.sendStatus(404);
      return;
    }

    const event = request.body?.event;

    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      response.status(400).json({ success: false });
      return;
    }

    appendClientRuntimeDiagnostic(event);

    response.set('Cache-Control', 'no-store');
    response.json({ success: true });
  });

  const renderPageResponse = async (
    request: express.Request,
    response: express.Response,
  ): Promise<void> => {
    const state = createInitialApplicationState();
    // SSR state is request-scoped; none of its subscriptions/endurance/runtime
    // must survive the HTTP response or be shared with another visitor.
    try {
      const requestedRoute = resolveUiPageRoute(
        request.path,
        state.company,
        state.currentLanguageId.toUpperCase() as 'EN' | 'EL',
      );
      // The initial SSR request is anonymous until the browser's trusted cookie
      // has been verified. Keep the protected route in the URL, but emit only Home.
      const route =
        isUiEntityPageRoute(requestedRoute) || requestedRoute?.kind === 'administration'
          ? resolveUiPageRoute('/', state.company)
          : requestedRoute;

      let status = requestedRoute ? 200 : 404;

      let page = route?.page ?? UI_NOT_FOUND_PAGE;

      let title = route ? uiPageTitle(route) : 'Page not found';

      let presentation = route?.presentation ?? UI_NOT_FOUND_PAGE_PRESENTATION;

      let context: Readonly<Record<string, unknown>> = route
        ? createUiPageContext(
            route,
            state.company,
            state.currentLanguageId.toUpperCase() as 'EN' | 'EL',
          )
        : Object.freeze({
            company: state.company,

            requestPath: request.path,
          });

      // The browser host verifies the cookie before exposing anonymous actions.
      context = Object.freeze({ ...context, auth: { anonymous: false } });

      let pageHtml: string;

      try {
        pageHtml =
          route?.path === '/configuration'
            ? renderConfigurationPageHost()
            : route?.path === '/system-settings'
              ? renderStoragePageHost()
              : isUiListPageRoute(route)
                ? renderListPageHost()
                : isUiEntryPageRoute(route)
                  ? renderEntryPageHost()
                  : await renderUiPage(pageSource, page, context);
      } catch (error) {
        status = 500;
        page = UI_ERROR_PAGE;
        title = 'Page unavailable';

        presentation = UI_ERROR_PAGE_PRESENTATION;

        context = Object.freeze({
          ...context,

          errorMessage: error instanceof Error ? error.message : String(error),
        });

        try {
          pageHtml = await renderUiPage(pageSource, page, context);
        } catch {
          pageHtml = '<section class="surface"><h2>Page unavailable</h2></section>';
        }
      }

      const currentPlatform =
        state.currentPlatformId === null
          ? null
          : resolveUiPlatformIdentity(
              state.currentPlatformId,
              state.currentLanguageId.toUpperCase() as 'EN' | 'EL',
            );

      const documentationPage =
        page.folder === UI_DOCUMENTATION_PAGE.folder && page.name === UI_DOCUMENTATION_PAGE.name;

      const renderedPage = renderPageComponent({
        language: state.currentLanguageId.toUpperCase() as 'EN' | 'EL',
        presentation,
        content: renderPageHost({
          html: pageHtml,
        }),
        ...(isUiListPageRoute(route) || isUiEntryPageRoute(route)
          ? { titleActions: renderSurfaceTitleDebuggerTools() }
          : documentationPage
            ? {
                titleActions: renderSurfaceAction({
                  label: multilingual(
                    state.currentLanguageId.toUpperCase() === 'EL' ? 'EL' : 'EN',
                    [],
                  ).resolve('@CM.OpenNewDocumentationPopup'),
                  icon: 'bi-box-arrow-up-right',
                  action: 'open-documentation-popup',
                }),
              }
            : {}),
      });

      const shell = renderShell({
        language: state.currentLanguageId.toUpperCase() as 'EN' | 'EL',
        header: renderHeader({
          versionLabel: state.versionLabel,
          status: renderHeaderStatus({
            uiLabel: 'EJS UI',
            versionLabel: state.versionLabel,
            apiStatus: 'checking',
          }),

          actions: `
                ${renderPlatformSelector({
                  current: currentPlatform,

                  platforms: getUiPlatforms(state.currentLanguageId.toUpperCase() as 'EN' | 'EL'),

                  navigation: state.platformNavigation,
                })}

                <span data-ejs1-auth-actions></span>
              `,
        }),

        primaryNavigation: renderPrimaryNavigation({
          items: state.primaryNavigation,

          languages: state.languages,

          developerItems: state.debugMenu,

          currentLanguage: state.currentLanguage,

          fontScalePercent: state.preferences.fontScalePercent,
          debuggerAllowed: false,
        }),

        workspaceNavigation: renderWorkspaceNavigation({
          items: state.workspaceNavigation,
          pathname: request.path,
          language: state.currentLanguageId.toUpperCase() === 'EL' ? 'EL' : 'EN',
        }),
        // SSR cannot trust a browser session yet; avoid an anonymous sidebar flash.
        workspaceNavigationAvailable: false,

        workspace: renderWorkspace({
          content: renderedPage,
        }),

        debugger: renderDebugger(),

        footer: renderFooter({
          language: state.currentLanguageId.toUpperCase() as 'EN' | 'EL',
          companyShortName: state.company.shortName,

          companyName: state.company.name,

          versionLabel: state.versionLabel,
        }),
      });

      response.status(status).render('index', {
        shell,

        preferences: renderPreferences({
          theme: DEFAULT_UI_THEME,
        }),

        pageTitle: `${title} · ManatOS EJS1`,

        pageStylesheetHref: uiPageStylesheetUrl(page),
        componentTemplateRoot: fileURLToPath(
          new URL('../../shared.UI.EJS/src/components/', import.meta.url),
        ),
        fieldTemplateRoot: fileURLToPath(
          new URL('../../shared.UI.EJS/src/components/entry/fields/types/', import.meta.url),
        ),
        fieldTemplateNames: [...uiFieldBehavior.keys()].map((type) =>
          type === 'string' ? 'TextField' : `${type.charAt(0).toUpperCase()}${type.slice(1)}Field`,
        ),
      });
    } finally {
      state.destroy();
    }
  };

  app.get(
    ['/', '/company', '/privacy', '/terms', '/documentation', '/platform', '/platform/:platformId'],
    (request, response) => {
      void renderPageResponse(request, response);
    },
  );

  app.use((request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return next();
    }

    const lastSegment = request.path.split('/').filter(Boolean).at(-1) ?? '';

    if (extname(lastSegment)) {
      return next();
    }

    void renderPageResponse(request, response);
  });

  app.use((_request, response) => response.sendStatus(404));

  return app;
}
