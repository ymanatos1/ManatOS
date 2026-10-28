import express, { Router, type Request, type Response } from 'express';

import type { Ejs1Config } from './config.js';

export interface AdministrationSession {
  readonly accessToken: string;
  readonly csrfToken: string;
}

const API_CONFIGURATION = '/api/v1/SysConfigurations';
const API_STORAGE = '/api/v1/system-settings/storage';

/**
 * Explicit HTTP-method/path mapping: an untrusted browser cannot choose an
 * arbitrary upstream endpoint. The API is still authoritative for permissions.
 */
export function ejs1AdministrationApiPath(method: string, path: string): string | null {
  if (method === 'GET' && path === '/configuration') {
    return API_CONFIGURATION;
  }

  if (method === 'GET' && path === '/storage') {
    return API_STORAGE;
  }

  if (method === 'POST' && path === '/storage/configurations') {
    return `${API_STORAGE}/configurations`;
  }

  if (method === 'PATCH' && path === '/storage/current') {
    return `${API_STORAGE}/current`;
  }

  if (method === 'PATCH' && path === '/storage/debugging') {
    return `${API_STORAGE}/debugging`;
  }

  if (method === 'PATCH' && path === '/storage/configurations/order') {
    return `${API_STORAGE}/configurations/order`;
  }

  const configuration = /^\/storage\/configurations\/((?:[0-9a-f-]{36}|default-json))$/i.exec(path);
  if (configuration && (method === 'PATCH' || method === 'DELETE')) {
    return `${API_STORAGE}/configurations/${configuration[1]}`;
  }

  const order = /^\/storage\/configurations\/((?:[0-9a-f-]{36}|default-json))\/order$/i.exec(path);
  if (order && method === 'PATCH') {
    return `${API_STORAGE}/configurations/${order[1]}/order`;
  }

  const target =
    /^\/storage\/target\/(test-connection|databases|database\/(?:inspect|prepare)|schema\/(?:inspect|prepare))$/.exec(
      path,
    );
  if (target && method === 'POST') {
    return `${API_STORAGE}/target/${target[1]}`;
  }

  const settingValue = /^\/configuration\/([0-9a-f-]{36})\/value$/i.exec(path);
  if (settingValue && method === 'PATCH') {
    return `${API_CONFIGURATION}/${settingValue[1]}/value`;
  }

  return null;
}

/** Reject cross-site mutations even when the browser sends a valid session cookie. */
function sameOrigin(req: Request): boolean {
  const origin = req.get('origin');
  const host = req.get('host');

  if (!origin || !host || req.get('sec-fetch-site') === 'cross-site') {
    return false;
  }

  try {
    const parsed = new URL(origin);
    const allowedProtocol = parsed.protocol === 'https:' || parsed.protocol === 'http:';
    return allowedProtocol && parsed.host === host;
  } catch {
    return false;
  }
}

function errorResponse(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({
    success: false,
    error: { code, message },
  });
}

/**
 * Forward the API response envelope, never an access token or authentication cookie.
 * This router is mounted inside Auth, using its existing session and CSRF lifecycle.
 */
async function forwardAdministrationRequest(
  req: Request,
  res: Response,
  config: Ejs1Config,
  authenticatedSession: (req: Request) => Promise<AdministrationSession | null>,
  matchesCsrf: (actual: string, expected: string) => boolean,
): Promise<void> {
  res.set('Cache-Control', 'no-store');

  const upstream = ejs1AdministrationApiPath(req.method, req.path);
  if (!upstream) {
    res.sendStatus(404);
    return;
  }

  if (req.method !== 'GET' && !sameOrigin(req)) {
    errorResponse(res, 403, 'ORIGIN_REQUIRED', 'Request origin is not allowed.');
    return;
  }

  try {
    const session = await authenticatedSession(req);
    if (!session) {
      errorResponse(res, 401, 'SESSION_EXPIRED', 'Please sign in again.');
      return;
    }

    const csrf = req.get('x-manatos-csrf') ?? '';
    if (req.method !== 'GET' && !matchesCsrf(csrf, session.csrfToken)) {
      errorResponse(res, 403, 'CSRF_INVALID', 'Your session has changed. Please retry.');
      return;
    }

    // Browser request headers, query strings and URLs are never forwarded.
    const headers: Record<string, string> = {
      authorization: `Bearer ${session.accessToken}`,
      accept: 'application/json',
      'x-client-name': 'ManatOS EJS1',
    };
    const requestOptions: RequestInit = {
      method: req.method,
      headers,
      signal: AbortSignal.timeout(20_000),
    };

    if (req.method !== 'GET') {
      headers['content-type'] = 'application/json';
      requestOptions.body = JSON.stringify(req.body ?? {});
    }

    const answer = await fetch(config.apiBaseUrl + upstream, requestOptions);
    const responseBody = await answer.text();

    if (responseBody.length > 2 * 1024 * 1024) {
      throw new Error('Administration response exceeds limit.');
    }

    res.status(answer.status).type('application/json').send(responseBody);
  } catch {
    errorResponse(res, 503, 'ADMIN_API_UNAVAILABLE', 'Administration service unavailable.');
  }
}

export function createEjs1AdministrationRouter(
  config: Ejs1Config,
  authenticatedSession: (req: Request) => Promise<AdministrationSession | null>,
  matchesCsrf: (actual: string, expected: string) => boolean,
): Router {
  const router = Router();
  router.use(express.json({ limit: '64kb', strict: true }));

  router.use(async (req, res: Response) => {
    await forwardAdministrationRequest(req, res, config, authenticatedSession, matchesCsrf);
  });

  return router;
}
