import type { RequestHandler } from 'express';

import { config } from '../../config.js';

const allowedMethods = Object.freeze(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

const allowedHeaders = Object.freeze([
  'Authorization',
  'Content-Type',
  'x-client-name',
  'x-manatos-diagnostics',
  'x-manatos-transaction-id',
  'x-request-id',
]);

const allowedHeaderNames = new Set(allowedHeaders.map((name) => name.toLowerCase()));

const exposedHeaders = Object.freeze(['x-manatos-transaction-id', 'x-request-id']);

/**
 * Origin resolver contract deliberately supports asynchronous implementations.
 *
 * Today the default resolver uses environment configuration plus the development
 * loopback rule. A future external-application registry can extend/replace the
 * resolver without changing the CORS middleware contract.
 */
export type CorsOriginResolver = (origin: string) => boolean | Promise<boolean>;

function normalizedOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isDevelopmentLoopbackOrigin(origin: string): boolean {
  if (config.NODE_ENV !== 'development' || !config.CORS_ALLOW_DEVELOPMENT_LOOPBACK) return false;

  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export const configuredCorsOriginResolver: CorsOriginResolver = (origin) => {
  const normalized = normalizedOrigin(origin);
  if (!normalized) return false;

  if (config.CORS_ALLOWED_ORIGINS.includes(normalized)) return true;
  return isDevelopmentLoopbackOrigin(normalized);
};

function requestedHeaderNames(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
}

function isCorsPreflight(method: string, requestedMethod: string | undefined): boolean {
  return method === 'OPTIONS' && Boolean(requestedMethod?.trim());
}

/**
 * Central browser CORS policy.
 *
 * Requests without Origin are non-CORS clients and pass through untouched.
 * Allowed browser origins receive explicit Access-Control-Allow-Origin rather
 * than a wildcard. Unknown origins receive no CORS permission; their preflight
 * is rejected before authentication/routes execute.
 *
 * x-internal-api-key is intentionally absent from allowedHeaders. It is a
 * server-to-server trust credential and must never become a browser capability.
 */
export function createCorsMiddleware(
  resolveOrigin: CorsOriginResolver = configuredCorsOriginResolver,
): RequestHandler {
  return async (req, res, next) => {
    const origin = req.header('origin')?.trim();
    if (!origin) {
      next();
      return;
    }

    res.vary('Origin');

    let allowed = false;
    try {
      allowed = await resolveOrigin(origin);
    } catch (error) {
      next(error);
      return;
    }

    const requestedMethod = req.header('access-control-request-method');
    const preflight = isCorsPreflight(req.method, requestedMethod);
    if (preflight) {
      res.vary('Access-Control-Request-Method');
      res.vary('Access-Control-Request-Headers');
    }

    if (!allowed) {
      if (preflight) {
        res.status(403).end();
        return;
      }

      next();
      return;
    }

    const normalized = normalizedOrigin(origin);
    if (!normalized) {
      if (preflight) {
        res.status(403).end();
        return;
      }

      next();
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', normalized);
    res.setHeader('Access-Control-Expose-Headers', exposedHeaders.join(', '));
    if (config.CORS_ALLOW_CREDENTIALS) res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (!preflight) {
      next();
      return;
    }

    const method = requestedMethod!.trim().toUpperCase();
    if (!allowedMethods.includes(method)) {
      res.status(403).end();
      return;
    }

    const requestedHeaders = requestedHeaderNames(req.header('access-control-request-headers'));
    if (requestedHeaders.some((name) => !allowedHeaderNames.has(name))) {
      res.status(403).end();
      return;
    }

    res.setHeader('Access-Control-Allow-Methods', allowedMethods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    res.setHeader('Access-Control-Max-Age', String(config.CORS_PREFLIGHT_MAX_AGE_SECONDS));
    res.status(204).end();
  };
}
