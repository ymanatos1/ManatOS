import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { memoizeRequest } from '../../src/runtime/request-memo.js';

describe('request-scoped support-read deduplication', () => {
  it('shares one in-flight/completed read only inside the same Express request', async () => {
    const firstRequest = {} as Request;
    const secondRequest = {} as Request;
    const load = vi.fn(async () => ({ value: 'canonical' }));

    const [first, duplicate] = await Promise.all([
      memoizeRequest(firstRequest, 'api:get:/resource', load),
      memoizeRequest(firstRequest, 'api:get:/resource', load),
    ]);

    expect(first).toBe(duplicate);
    expect(load).toHaveBeenCalledTimes(1);
    await memoizeRequest(secondRequest, 'api:get:/resource', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not retain failed reads inside the request registry', async () => {
    const request = {} as Request;
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce('recovered');

    await expect(memoizeRequest(request, 'api:get:/retry', load)).rejects.toThrow('temporary');
    await expect(memoizeRequest(request, 'api:get:/retry', load)).resolves.toBe('recovered');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
