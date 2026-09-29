import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFile(resolve(testDirectory, '..', '..', path), 'utf8');

describe('direct Entry host error boundary', () => {
  it('keeps direct-host failures on the JSON host contract instead of rendering an application shell', async () => {
    const handler = await source('src/middleware/error-handler.ts');

    expect(handler).toContain("req.query._entryDirectHost === '1'");
    expect(handler).toContain("req.body?._entryDirectHost === '1'");
    expect(handler).toContain('isDirectEntryHostRequest(req)');
    expect(handler).toContain('res.json(httpErrorEnvelope(error))');
  });
});
