import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { createUiApp } from '../src/app.js';

const originalFetch = globalThis.fetch;

const testConfig = Object.freeze({
  nodeEnv: 'test' as const,
  apiBaseUrl: 'https://api.example.test',
  documentationRepositoryRoot: fileURLToPath(new URL('../../', import.meta.url)),
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('EJS1 application', () => {
  it('composes the shared EJS application shell', async () => {
    const response = await request(createUiApp(testConfig)).get('/');

    expect(response.status).toBe(200);
    expect(response.type).toMatch(/html/);

    expect(response.text).toContain('ManatOS');
    expect(response.text).toContain('EJS1');
    expect(response.text).toContain(
      'A semantic foundation for business platforms and applications',
    );

    expect(response.text).toContain('Home');
    expect(response.text).toContain('Company');
    expect(response.text).toContain('protoCRM');
    expect(response.text).toContain('Panoptes');
    expect(response.text).toContain('Resources');

    expect(response.text).not.toContain('Apps Playground');
    // EJS1 renders an anonymous shell; authenticated workspace actions stay hidden.
    const workspaceHtml =
      response.text.match(/<aside class="workspace-navigation">([\s\S]*?)<\/aside>/)?.[1] ?? '';
    for (const privateItem of [
      'Administration',
      'Users',
      'Principals',
      'Applications',
      'Licenses',
      'Configuration',
      'External authentication',
      'Preferences',
      'Logout',
    ]) {
      expect(workspaceHtml).not.toContain(privateItem);
    }

    expect(response.text).toContain('class="page-breadcrumb"');
    expect(response.text).toContain('class="surface-title page-title"');
    expect(response.text).toContain('class="page-content"');
    expect(response.text).toContain('data-page-details-toggle');
    expect(response.text).toContain('data-manatos-debugger-host');
    expect(response.text).toMatch(/<\/main>\s*<div class="manatos-debugger-host"/);

    expect(response.text).toContain('manatos.ui.preferences.v2');
    expect(response.text).toContain('preferences?.version === 2');

    expect(response.text).toContain('manatos-logo-middle-1.png');
    expect(response.text).toContain('manatos-logo-middle-2.png');

    expect(response.text).toContain('data-platform-id="protocrm"');
    expect(response.text).toContain('data-platform-none');
    expect(response.text).toContain('platform-icon bi bi-boxes');

    expect(response.text).toContain('/assets/flags/en.svg');
    expect(response.text).toContain('/assets/flags/el.svg');
    expect(response.text).toContain('class="font-scale"');
    expect(response.text).toContain('bi-caret-up-fill');
    expect(response.text).toContain('bi-caret-down-fill');
    expect(response.text).toContain('data-font-scale-reset');
    expect(response.text).toContain('title="Reset to 100%"');
    expect(response.text).toContain('data-font-scale-delta="-20"');
    expect(response.text).toContain('>100%</span>');

    expect(response.text).toContain('data-primary-navigation-toggle');
    expect(response.text).toContain('data-navigation-id=');
    // The old anonymous, hard-coded Preferences button was removed.
    expect(response.text).not.toContain('data-preferences-open');

    expect(response.text).toContain('href="/platform/protocrm"');

    expect(response.text).not.toContain('ApplicationShell');
    expect(response.text).not.toContain('TopBar');
    expect(response.text).not.toContain('HorizontalMenu');
    expect(response.text).not.toContain('LeftMenu');
    expect(response.text).not.toContain('PageLayout');
  });

  it('preserves ManatOS diagnostics/correlation headers across the EJS1 API proxy', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({ success: true, data: { value: 1 } }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store',
          'x-request-id': 'request-1',
          'x-manatos-transaction-id': 'tx-1',
        },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const response = await request(createUiApp(testConfig))
      .post('/api/v1/test')
      .set('authorization', 'Bearer token')
      .set('cookie', 'session=test')
      .set('x-request-id', 'request-1')
      .set('x-manatos-diagnostics', 'true')
      .send({ value: 1 });

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe('request-1');
    expect(response.headers['x-manatos-transaction-id']).toBe('tx-1');
    expect(response.headers['cache-control']).toBe('no-store');

    const [target, init] = fetchMock.mock.calls[0]!;
    expect(target).toBe('https://api.example.test/api/v1/test');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer token');
    expect(headers.get('cookie')).toBe('session=test');
    expect(headers.get('x-request-id')).toBe('request-1');
    expect(headers.get('x-manatos-diagnostics')).toBe('true');
  });

  it('serves canonical static page routes and real 404 status', async () => {
    const app = createUiApp(testConfig);
    const company = await request(app).get('/company');

    expect(company.status).toBe(200);
    expect(company.text).toContain('ManatOS Application Foundation');

    const platform = await request(app).get('/platform/protocrm');
    expect(platform.status).toBe(200);
    expect(platform.text).toContain('Customer 360°');

    const documentation = await request(app).get('/documentation');
    expect(documentation.status).toBe(200);
    expect(documentation.text).not.toContain('data-detachable-window');
    expect(documentation.text).not.toContain('data-detach-toggle');
    expect(documentation.text).toContain('data-surface-action="open-documentation-popup"');
    expect(documentation.text).toContain('Open new documentation popup');

    const missing = await request(app).get('/does-not-exist');
    expect(missing.status).toBe(404);
    expect(missing.text).toContain('Page not found');
    expect(missing.text).not.toContain('data-page-details-toggle');
    expect(missing.text).not.toContain('data-page-details');
  });

  it('serves the canonical repository documentation tree from the UI host', async () => {
    const response = await request(createUiApp(testConfig)).get('/_manatos/documentation/tree');
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'README.md',
          path: 'README.md',
        }),
      ]),
    );
  });
});

// The EJS1 host owns browser sessions: Auth traffic never passes through its generic API proxy.
describe('EJS1 trusted Auth host', () => {
  it('issues an EJS1-only HttpOnly CSRF session cookie and no API bearer token', async () => {
    const app = createUiApp({
      ...testConfig,
      authDelegationSecret: 'test-delegation-secret',
      publicBaseUrl: 'https://ui.example.test',
    });
    const response = await request(app).get('/_manatos/auth/csrf');
    expect(response.status).toBe(200);
    expect(response.body.data.csrfToken).toEqual(expect.any(String));
    const cookie = response.headers['set-cookie'] as unknown as string[];
    expect(
      cookie.some((value) => value.startsWith('manatos_ejs1_auth=') && value.includes('HttpOnly')),
    ).toBe(true);
    expect(response.text).not.toContain('accessToken');
  });
});
