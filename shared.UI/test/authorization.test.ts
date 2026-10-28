import { describe, expect, it, vi } from 'vitest';

import {
  ManatosApiClient,
  UiAuthorizationClient,
  runtimeUserFromAuthorization,
  type ApiTransport,
  type ApiTransportResponse,
} from '../src/index.js';

function response(body: unknown, status = 200): ApiTransportResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    body,
  };
}

describe('UiAuthorizationClient', () => {
  it('loads the selected-platform authorization projection', async () => {
    const request = vi.fn(async () =>
      response({
        success: true,
        data: {
          platformId: 'panoptes',
          user: { id: 'user-1', name: 'Admin', role: 'Admin' },
          platformCapabilities: { platformAccess: true },
          entities: {},
        },
      }),
    );

    const transport: ApiTransport = { request };
    const client = new UiAuthorizationClient(new ManatosApiClient(transport));
    const projection = await client.load('panoptes');

    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/api/v1/authorization/context/panoptes/$capabilities',
    });
    expect(projection.platformId).toBe('panoptes');
    expect(
      runtimeUserFromAuthorization(projection).permissions.platforms.panoptes?.capabilities,
    ).toEqual(expect.objectContaining({ platformAccess: true }));
  });
});
