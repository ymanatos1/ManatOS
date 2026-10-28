import { describe, expect, it, vi } from 'vitest';
import { createUiBrowserSurfaceResourcePort } from '../src/browser/surface-resource-port.js';

describe('Entry expression capability resource', () => {
  it('uses the authenticated UI host with CSRF and submits only a function call', async () => {
    const requests: Array<{ path: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (path: string | URL | Request, init?: RequestInit) => {
      requests.push({ path: String(path), ...(init ? { init } : {}) });
      return Response.json(
        String(path).endsWith('/csrf')
          ? { success: true, data: { csrfToken: 'local-csrf' } }
          : { success: true, data: { value: 'resolved-root' } },
      );
    });
    const port = createUiBrowserSurfaceResourcePort(fetcher as typeof fetch);
    const value = await port.request<{ value: string }>({
      kind: 'sysbo.expression-function',
      functionName: 'TraverseEntity',
      args: ['parent', 'sys-principals', 'parentId', 'id'],
    });
    expect(value.value).toBe('resolved-root');
    expect(requests).toHaveLength(2);
    expect(requests[1]?.path).toBe('/_manatos/auth/resources/expression-function');
    expect(requests[1]?.init?.method).toBe('POST');
    expect((requests[1]?.init?.headers as Record<string, string>)['x-manatos-csrf']).toBe(
      'local-csrf',
    );
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      functionName: 'TraverseEntity',
      args: ['parent', 'sys-principals', 'parentId', 'id'],
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
