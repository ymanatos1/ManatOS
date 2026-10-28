import { extname, resolve } from 'node:path';

import express, { type Express } from 'express';

import { resolveUiPageRoute, isUiEntityPageRoute } from '@manatos/shared-ui';

import { NodeUiPageContentSource, RepositoryDocumentationSource } from '@manatos/shared-ui/node';

import type { Ng1HostConfig } from './config.js';

import { createNg1AuthRouter } from './auth-router.js';

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

function looksLikeFileRequest(pathname: string): boolean {
  const last = pathname.split('/').filter(Boolean).at(-1) ?? '';

  return extname(last) !== '';
}

export function createNg1HostApp(config: Ng1HostConfig): Express {
  const app = express();

  const pageSource = new NodeUiPageContentSource();

  const documentationSource = new RepositoryDocumentationSource(config.documentationRepositoryRoot);

  app.disable('x-powered-by');

  const authRouter = createNg1AuthRouter(config, (oauthRouter) => {
    app.use('/auth/oauth', oauthRouter);
  });
  app.use('/_manatos/auth', authRouter);
  // All /bo entity pages require an authenticated host session, as in EJS0.
  app.use('/bo', authRouter.requireProtectedPage);
  app.use('/configuration', authRouter.requireProtectedPage);
  app.use('/system-settings', authRouter.requireProtectedPage);

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

  if (config.nodeEnv !== 'production') {
    app.use((_request, response) => response.sendStatus(404));

    return app;
  }

  app.use(express.static(config.angularDistRoot));

  const indexFile = resolve(config.angularDistRoot, 'index.html');

  app.use(async (request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return next();
    }

    if (looksLikeFileRequest(request.path)) {
      return next();
    }

    const route = resolveUiPageRoute(request.path);

    if (!route) {
      response.status(404).sendFile(indexFile);

      return;
    }

    try {
      // Entry/List and Administration are Angular-owned virtual pages, not static HTML.
      if (!isUiEntityPageRoute(route) && route.kind !== 'administration')
        await pageSource.readPage(route.page);

      response.status(200).sendFile(indexFile);
    } catch {
      response.status(500).sendFile(indexFile);
    }
  });

  app.use((_request, response) => response.sendStatus(404));

  return app;
}
