import { describe, expect, it, vi } from 'vitest';

import {
  ManatosApiClient,
  UiExpressionCapabilityClient,
  type ApiTransport,
  type ApiTransportResponse,
} from '../src/index.js';

function response(body: unknown): ApiTransportResponse {
  return { ok: true, status: 200, statusText: 'OK', body };
}

describe('UiExpressionCapabilityClient', () => {
  it('delegates only the reached function call through the existing ManatOS API client', async () => {
    const request = vi.fn(async () =>
      response({
        success: true,
        data: { value: 'root' },
      }),
    );
    const transport: ApiTransport = { request };
    const client = new UiExpressionCapabilityClient(new ManatosApiClient(transport));

    await expect(
      client.evaluateFunction({
        functionName: 'TraverseEntity',
        capability: 'entityResolver',
        args: ['parent', 'sys-principals', 'parentId', 'id'],
      }),
    ).resolves.toBe('root');

    expect(client.capabilities).toEqual(['entityResolver']);
    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/api/v1/expressions/evaluate-function',
      body: {
        functionName: 'TraverseEntity',
        args: ['parent', 'sys-principals', 'parentId', 'id'],
      },
    });
  });
});
