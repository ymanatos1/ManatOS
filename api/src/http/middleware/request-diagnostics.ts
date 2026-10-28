import { gzipSync } from 'node:zlib';

import type { RequestHandler } from 'express';

import {
  MANATOS_API_DIAGNOSTICS_HEADER,
  parseApiDiagnosticsMode,
  type ApiDiagnosticsResponseEnvelope,
} from '@manatos/shared';

import { config } from '../../config.js';
import { apiContextRuntime } from '../../context/api-context-runtime.js';
import { apiRequestDiagnostics } from '../../debug/request-diagnostics.js';

/**
 * Opt-in diagnostics response envelope for development/test API calls.
 *
 * The header controls three transport states only: false, true, compressed.
 * Policy/configuration deciding which state to send belongs to the client and
 * can change later without altering this middleware or individual endpoints.
 */
export const requestDiagnosticsMiddleware: RequestHandler = (req, res, next) => {
  const mode = parseApiDiagnosticsMode(req.header(MANATOS_API_DIAGNOSTICS_HEADER));
  if (mode === false || config.NODE_ENV === 'production') {
    next();
    return;
  }

  const requestId = String(res.getHeader('x-request-id') ?? '').trim();
  if (!requestId) {
    next();
    return;
  }

  apiRequestDiagnostics.begin(requestId);
  res.vary(MANATOS_API_DIAGNOSTICS_HEADER);

  const originalJson = res.json.bind(res);
  let completed = false;

  res.json = ((body: unknown) => {
    if (completed) return originalJson(body);
    completed = true;

    const diagnostics = apiRequestDiagnostics.complete(
      requestId,
      apiContextRuntime.currentRequestSnapshot(),
    );
    const envelope: ApiDiagnosticsResponseEnvelope = {
      $manatosDiagnostics: diagnostics,
      response: body,
    };

    if (mode !== 'compressed') return originalJson(envelope);

    const compressed = gzipSync(Buffer.from(JSON.stringify(envelope), 'utf8'));
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('content-encoding', 'gzip');
    res.setHeader('content-length', String(compressed.byteLength));
    return res.send(compressed);
  }) as typeof res.json;

  const discardIfUnsent = () => {
    if (!completed) apiRequestDiagnostics.discard(requestId);
  };
  res.once('finish', discardIfUnsent);
  res.once('close', discardIfUnsent);

  next();
};
