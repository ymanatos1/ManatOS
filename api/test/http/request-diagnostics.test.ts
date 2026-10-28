import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { MANATOS_API_DIAGNOSTICS_HEADER } from '@manatos/shared';

import { requestContextMiddleware } from '../../src/http/middleware/request-context.js';
import { requestDiagnosticsMiddleware } from '../../src/http/middleware/request-diagnostics.js';
import { logger } from '../../src/logging/logger.js';

function diagnosticsApp() {
  const app = express();
  app.use(requestContextMiddleware);
  app.use(requestDiagnosticsMiddleware);
  app.get('/diagnostics', (_req, res) => {
    logger.info('diagnostics test log', { visible: 'yes', password: 'must-not-leak' });
    res.json({ success: true, data: { value: 7 } });
  });
  return app;
}

describe('request diagnostics middleware', () => {
  it('keeps the normal response shape when diagnostics are disabled', async () => {
    const response = await request(diagnosticsApp())
      .get('/diagnostics')
      .set('x-request-id', 'diagnostics-disabled')
      .set(MANATOS_API_DIAGNOSTICS_HEADER, 'false')
      .expect(200);

    expect(response.body).toEqual({ success: true, data: { value: 7 } });
  });

  it('returns sanitized diagnostics with the original response when requested', async () => {
    const response = await request(diagnosticsApp())
      .get('/diagnostics')
      .set('x-request-id', 'diagnostics-enabled')
      .set(MANATOS_API_DIAGNOSTICS_HEADER, 'true')
      .expect(200);

    expect(response.body.response).toEqual({ success: true, data: { value: 7 } });
    expect(response.body.$manatosDiagnostics.requestId).toBe('diagnostics-enabled');
    expect(response.body.$manatosDiagnostics.apiContext?.ctx).toBeDefined();
    expect(response.body.$manatosDiagnostics.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestId: 'diagnostics-enabled',
          message: 'diagnostics test log',
          visible: 'yes',
          password: '[REDACTED]',
        }),
      ]),
    );
  });

  it('supports the compressed diagnostics mode on the same original response', async () => {
    const response = await request(diagnosticsApp())
      .get('/diagnostics')
      .set('x-request-id', 'diagnostics-compressed')
      .set(MANATOS_API_DIAGNOSTICS_HEADER, 'compressed')
      .expect(200);

    expect(response.headers['content-encoding']).toBe('gzip');
    expect(response.body.response).toEqual({ success: true, data: { value: 7 } });
    expect(response.body.$manatosDiagnostics.requestId).toBe('diagnostics-compressed');
  });
});
