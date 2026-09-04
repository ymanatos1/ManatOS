import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const sharedSource = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', 'shared', relativePath), 'utf8');

describe('metadata-driven SysUser presentation', () => {
  it('places Description on a full row immediately below the user-name row', async () => {
    const uiMetadata = await sharedSource('src/metadata/ui/identity.ts');
    const usersStart = uiMetadata.indexOf('export const sysBOUsersUIMetadata');
    const usersEnd = uiMetadata.indexOf('export const sysBOExtAuthProvidersUIMetadata', usersStart);
    const users = uiMetadata.slice(usersStart, usersEnd);

    expect(users).toMatch(/field: 'name', span: 6[\s\S]*?field: 'enabled', span: 6[\s\S]*?field: 'description', span: 12/);
    expect(users.indexOf("field: 'description'")).toBeLessThan(users.indexOf("field: 'firstName'"));
  });

  it('keeps create-mode password status calculations from resolving absent runtime hasPassword', async () => {
    const canonical = await sharedSource('src/metadata/bo/identity.ts');
    const uiMetadata = await sharedSource('src/metadata/ui/identity.ts');

    expect(canonical).toContain("mode === 'create' ? 'Not configured' : hasPassword ? 'Configured' : 'Not configured'");
    expect(uiMetadata).toContain("mode === 'create' ? 'secondary' : hasPassword ? 'success' : 'secondary'");
    expect(uiMetadata).toContain("mode === 'create' ? 'dash-circle' : hasPassword ? 'check-circle-fill' : 'dash-circle'");
  });
});
