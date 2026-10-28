import { describe, expect, it, vi } from 'vitest';

import {
  ManatosApiClient,
  UiBootstrapClient,
  type ApiTransport,
  type ApiTransportResponse,
  type UiBootstrapState,
} from '../src/index.js';

function response(body: unknown, status = 200): ApiTransportResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Service Unavailable',
    body,
  };
}

describe('UiBootstrapClient', () => {
  it('loads the public UI bootstrap through ManatosApiClient', async () => {
    const bootstrap: UiBootstrapState = {
      server: {
        alive: true,
        implementationVersion: '0.1.0',
      },
      api: {
        version: 'v1',
      },
      ui: {
        pageSizeOptions: [10, 20, 50],
        defaultPageSize: 20,
        showTechnicalErrorDetails: false,
        sessionErrorLogMaxEntries: 20,
        donationsShow: true,
      },
    };

    const request = vi.fn(async () =>
      response({
        success: true,
        data: bootstrap,
      }),
    );

    const transport: ApiTransport = { request };
    const client = new UiBootstrapClient(new ManatosApiClient(transport));

    await expect(client.load()).resolves.toEqual(bootstrap);

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/api/v1/public/ui-bootstrap',
    });
  });

  it('loads and maps API health', async () => {
    const request = vi.fn(async () =>
      response({
        success: true,
        data: {
          status: 'ok',
          version: '0.1.0',
        },
      }),
    );

    const transport: ApiTransport = { request };
    const client = new UiBootstrapClient(new ManatosApiClient(transport));

    await expect(client.health()).resolves.toEqual({
      alive: true,
      implementationVersion: '0.1.0',
    });

    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/health',
    });
  });

  it('propagates normalized API failures', async () => {
    const request = vi.fn(async () =>
      response(
        {
          success: false,
          errorMessage: 'Bootstrap unavailable.',
          error: {
            code: 'BOOTSTRAP_UNAVAILABLE',
            message: 'Bootstrap unavailable.',
            developerMessage: 'Public UI bootstrap failed.',
            retryable: true,
          },
        },
        503,
      ),
    );

    const transport: ApiTransport = { request };
    const client = new UiBootstrapClient(new ManatosApiClient(transport));

    await expect(client.load()).rejects.toMatchObject({
      code: 'BOOTSTRAP_UNAVAILABLE',
      userMessage: 'Bootstrap unavailable.',
      retryable: true,
    });
  });
});
