import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sysBOUsersMetadata, sysBOUsersUIMetadata, tabContentKeys } from '@manatos/shared';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const uiSource = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');

describe('metadata-driven SysUser presentation', () => {
  it('places Photo with identity/state, then Description on its own full row', () => {
    const general = sysBOUsersUIMetadata.record?.tabs?.find((tab) => tab.label === 'General');
    const content = general?.content ?? [];
    const fields = content
      .filter(
        (item): item is Extract<(typeof content)[number], { kind: 'field' }> =>
          item.kind === 'field',
      )
      .map((item) => ({ field: item.field, span: item.span }));

    expect(fields.slice(0, 5)).toEqual([
      { field: 'name', span: 6 },
      { field: 'enabled', span: 2 },
      { field: 'photo', span: 4 },
      { field: 'email', span: 6 },
      { field: 'telephoneNumber', span: 6 },
    ]);
    expect(fields.find((item) => item.field === 'description')).toEqual({
      field: 'description',
      span: 12,
    });
    expect(fields.findIndex((item) => item.field === 'description')).toBeLessThan(
      fields.findIndex((item) => item.field === 'firstName'),
    );
  });

  it('keeps create-mode password status calculations from resolving absent runtime hasPassword', () => {
    expect(sysBOUsersMetadata.fieldDefinition.localPasswordStatus?.calculation?.expression).toBe(
      "mode === 'create' ? 'Not configured' : hasPassword ? 'Configured' : 'Not configured'",
    );
    expect(
      sysBOUsersUIMetadata.record?.fieldOverrides?.localPasswordStatus?.presentation?.tone,
    ).toEqual({
      expression: "mode === 'create' ? 'secondary' : hasPassword ? 'success' : 'secondary'",
    });
    expect(
      sysBOUsersUIMetadata.record?.fieldOverrides?.localPasswordStatus?.presentation?.icon,
    ).toEqual({
      expression:
        "mode === 'create' ? 'dash-circle' : hasPassword ? 'check-circle-fill' : 'dash-circle'",
    });
  });

  it('projects the Principal-owned identity endpoint as a non-persistent inverse User field', () => {
    const authentication = sysBOUsersUIMetadata.record?.tabs?.find(
      (tab) => tab.label === 'Authentication',
    );

    expect(sysBOUsersMetadata.relationships?.principal).toBeUndefined();
    expect(sysBOUsersMetadata.fieldDefinition.principalId).toMatchObject({
      persistent: false,
      inverseRelationship: { objectKey: 'sys-principals', relationship: 'user' },
    });
    expect(tabContentKeys(authentication?.content)[0]).toBe('principalId');
  });

  it('uses absolute root aliases when metadata intentionally targets root-owned CTX state', () => {
    expect(sysBOUsersUIMetadata.record?.entryActions?.verifyEmail?.visible).toEqual({
      expression:
        '$system.client.features.allowAdminEmailVerification && ' +
        "$user.permissions.userRole === 'Admin' && " +
        'id !== $user.fields.id.value && ' +
        'emailVerified !== true',
    });
  });

  it('keeps API-safe hasPassword facts available to V2 SSR diagnostics without server ctx.ui topology', async () => {
    const entry = await uiSource('views/components/runtime/entity-entry.ejs');
    expect(entry).toContain('const v2BootstrapFacts = v2Bootstrap?.entry?.facts');
    expect(entry).toContain('...v2BootstrapFacts');
    expect(entry).not.toContain('ctx.ui?.level');
  });
});
