import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  apiLogLineMatchesRequest,
  apiTrafficRepositoryRoot,
} from '../../src/debug/api-traffic-log-reader.js';

describe('API Traffic local log reader', () => {
  it('anchors shared diagnostics to the repository layout instead of process cwd', () => {
    const root = resolve('/manatos-test-root');
    const sourceModule = pathToFileURL(
      resolve(root, 'ui/src/debug/api-traffic-log-reader.ts'),
    ).href;
    const compiledModule = pathToFileURL(
      resolve(root, 'ui/dist/debug/api-traffic-log-reader.js'),
    ).href;

    expect(apiTrafficRepositoryRoot(sourceModule)).toBe(root);
    expect(apiTrafficRepositoryRoot(compiledModule)).toBe(root);
  });

  it('matches structured JSON log lines by exact request id', () => {
    expect(
      apiLogLineMatchesRequest(
        JSON.stringify({ requestId: 'call-123', message: 'storage ready' }),
        'call-123',
      ),
    ).toBe(true);
    expect(
      apiLogLineMatchesRequest(
        JSON.stringify({ requestId: 'call-1234', message: 'different call' }),
        'call-123',
      ),
    ).toBe(false);
  });

  it('supports the existing pretty console request-id prefix as a fallback', () => {
    expect(
      apiLogLineMatchesRequest(
        '[2026-09-14T00:00:00.000Z] [INFO] [call-123] request complete',
        'call-123',
      ),
    ).toBe(true);
  });
});
