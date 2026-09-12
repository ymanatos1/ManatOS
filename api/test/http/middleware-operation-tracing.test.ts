import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');

describe('API pre-controller semantic tracing', () => {
  it('places security and JSON parsing inside the request operation context', async () => {
    const app = await source('src/app.ts');
    const auth = await source('src/auth/auth-middleware.ts');
    const internalKey = await source('src/http/middleware/internal-api-key.ts');
    const adapter = await source('src/http/middleware/operation-middleware.ts');

    expect(app.indexOf('app.use(requestContextMiddleware)')).toBeLessThan(
      app.indexOf("operationMiddleware('Apply HTTP security policy'"),
    );
    expect(app).toContain("'Parse JSON request body'");
    expect(auth).toContain("'Authenticate API session'");
    expect(auth).toContain("'Authorize API role'");
    expect(internalKey).toContain("'Authorize internal API key'");
    expect(adapter).toContain('operationContext');
    expect(adapter).toContain('.run(');
  });
});
