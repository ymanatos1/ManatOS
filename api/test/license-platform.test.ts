import { describe, expect, it } from 'vitest';

import {
  MCRM_PLATFORM_ID,
  licenseGrantsApplicationAccess,
  licenseGrantsPlatformAccess,
  SysBOLicenseStatus,
  SysBOPrincipalType,
  type SysBOLicense,
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
  it('treats enabled active date-valid licenses as the source of platform/application entitlement', () => {
    const base: SysBOLicense = {
      id: 'license-1',
      name: 'Entitlement',
      principalId: 'principal-1',
      platformId: MCRM_PLATFORM_ID,
      status: SysBOLicenseStatus.Active,
      quantity: 1,
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'System',
      updatedAt: '2026-01-01T00:00:00.000Z',
      updatedBy: 'System',
    };
    const now = new Date('2026-08-30T12:00:00.000Z');

    expect(licenseGrantsPlatformAccess(base, MCRM_PLATFORM_ID, now)).toBe(true);
    expect(licenseGrantsApplicationAccess(base, MCRM_PLATFORM_ID, 'app-1', now)).toBe(true);
    expect(licenseGrantsApplicationAccess({ ...base, applicationId: 'app-1' }, MCRM_PLATFORM_ID, 'app-1', now)).toBe(true);
    expect(licenseGrantsApplicationAccess({ ...base, applicationId: 'app-1' }, MCRM_PLATFORM_ID, 'app-2', now)).toBe(false);
    expect(licenseGrantsPlatformAccess({ ...base, validUntil: '2026-08-29T23:59:59.000Z' }, MCRM_PLATFORM_ID, now)).toBe(false);
    expect(licenseGrantsPlatformAccess({ ...base, quantity: 0 }, MCRM_PLATFORM_ID, now)).toBe(false);
    expect(licenseGrantsPlatformAccess({ ...base, enabled: false }, MCRM_PLATFORM_ID, now)).toBe(false);
  });

});
