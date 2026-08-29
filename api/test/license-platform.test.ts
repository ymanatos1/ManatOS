import { describe, expect, it } from 'vitest';

import {
  MCRM_PLATFORM_ID,
  SysBOLicenseStatus,
  SysBOPrincipalType,
} from '@manatos/shared';

import { SYSTEM_AUDIT_ACTOR } from '../src/audit/audit-service.js';

import { createTestApi } from './test-helpers.js';

describe('platform-aware licenses', () => {
  it('allows one principal to own multiple platform-wide licenses', async () => {
    const context = await createTestApi();

    const principal = await context.services.principals.create(
      {
        name: 'Acme',
        principalType: SysBOPrincipalType.Company,
        parentId: null,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );

    const first = await context.services.licenses.create(
      {
        name: 'Acme mCRM 1',
        principalId: principal.id,
        platformId: MCRM_PLATFORM_ID,
        status: SysBOLicenseStatus.Active,
        quantity: 1,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );

    const second = await context.services.licenses.create(
      {
        name: 'Acme mCRM 2',
        principalId: principal.id,
        platformId: MCRM_PLATFORM_ID,
        status: SysBOLicenseStatus.Active,
        quantity: 5,
        enabled: true,
      },
      SYSTEM_AUDIT_ACTOR,
    );

    expect(first.principalId).toBe(principal.id);
    expect(second.principalId).toBe(principal.id);
    expect(first.applicationId).toBeUndefined();
    expect(second.applicationId).toBeUndefined();
  });
});
