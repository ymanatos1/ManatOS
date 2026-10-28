import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import request from 'supertest';

import { config } from '../../src/config.js';
import { createTestApi } from '../support/test-helpers.js';

const original = {
  NODE_ENV: config.NODE_ENV,
  CORS_ALLOWED_ORIGINS: [...config.CORS_ALLOWED_ORIGINS],
  CORS_ALLOW_DEVELOPMENT_LOOPBACK: config.CORS_ALLOW_DEVELOPMENT_LOOPBACK,
  CORS_ALLOW_CREDENTIALS: config.CORS_ALLOW_CREDENTIALS,
  CORS_PREFLIGHT_MAX_AGE_SECONDS: config.CORS_PREFLIGHT_MAX_AGE_SECONDS,
};

beforeEach(() => {
  config.NODE_ENV = 'development';
  config.CORS_ALLOWED_ORIGINS = ['https://app.manatos.info'];
  config.CORS_ALLOW_DEVELOPMENT_LOOPBACK = true;
  config.CORS_ALLOW_CREDENTIALS = false;
  config.CORS_PREFLIGHT_MAX_AGE_SECONDS = 600;
});

afterEach(() => {
  config.NODE_ENV = original.NODE_ENV;
  config.CORS_ALLOWED_ORIGINS = [...original.CORS_ALLOWED_ORIGINS];
  config.CORS_ALLOW_DEVELOPMENT_LOOPBACK = original.CORS_ALLOW_DEVELOPMENT_LOOPBACK;
  config.CORS_ALLOW_CREDENTIALS = original.CORS_ALLOW_CREDENTIALS;
  config.CORS_PREFLIGHT_MAX_AGE_SECONDS = original.CORS_PREFLIGHT_MAX_AGE_SECONDS;
});

describe('API CORS policy', () => {
  it('allows development loopback origins on arbitrary ports and exposes correlation headers', async () => {
    const { app } = await createTestApi();

    const response = await request(app)
      .get('/api/v1/public/ui-bootstrap')
      .set('Origin', 'https://localhost:7197');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://localhost:7197');
    expect(response.headers.vary).toContain('Origin');
    expect(response.headers['access-control-expose-headers']).toContain('x-request-id');
    expect(response.headers['access-control-expose-headers']).toContain('x-manatos-transaction-id');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('allows explicitly configured production origins outside development', async () => {
    config.NODE_ENV = 'production';
    const { app } = await createTestApi();

    const response = await request(app).get('/health').set('Origin', 'https://app.manatos.info');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://app.manatos.info');
  });

  it('can enable credentialed CORS later without changing the origin policy', async () => {
    config.NODE_ENV = 'production';
    config.CORS_ALLOW_CREDENTIALS = true;
    const { app } = await createTestApi();

    const response = await request(app).get('/health').set('Origin', 'https://app.manatos.info');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://app.manatos.info');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not allow the development loopback rule in production', async () => {
    config.NODE_ENV = 'production';
    const { app } = await createTestApi();

    const response = await request(app).get('/health').set('Origin', 'https://localhost:7197');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('handles an allowed browser preflight before routes/authentication', async () => {
    const { app } = await createTestApi();

    const response = await request(app)
      .options('/api/v1/SysApplications')
      .set('Origin', 'http://localhost:4200')
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'authorization, content-type, x-request-id, x-manatos-diagnostics, x-manatos-transaction-id, x-client-name',
      );

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:4200');
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-headers']).toContain('Authorization');
    expect(response.headers['access-control-allow-headers']).toContain('x-manatos-transaction-id');
  });

  it('rejects an unknown-origin preflight', async () => {
    const { app } = await createTestApi();

    const response = await request(app)
      .options('/api/v1/public/ui-bootstrap')
      .set('Origin', 'https://untrusted.example')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.status).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects browser attempts to request the server-only internal API key header', async () => {
    const { app } = await createTestApi();

    const response = await request(app)
      .options('/api/v1/internal/example')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type, x-internal-api-key');

    expect(response.status).toBe(403);
  });

  it('leaves non-browser clients untouched when Origin is absent', async () => {
    const { app } = await createTestApi();

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(String(response.headers.vary ?? '')).not.toContain('Origin');
  });
});
