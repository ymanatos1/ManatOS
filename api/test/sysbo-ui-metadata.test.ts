import { describe, expect, it } from 'vitest';
import { sysBOLicensesMetadata } from '@manatos/shared';

import { allSysBOUIMetadata } from '../src/metadata/sysbo-ui-registry.js';

describe('metadata-driven SysBO UI conventions', () => {
  it('gives every metadata-driven entry form the same icon-bearing General tab', () => {
    const entries = Object.values(allSysBOUIMetadata);
    expect(entries.length).toBeGreaterThan(0);

    for (const metadata of entries) {
      const general = metadata.record.tabs.find((tab) => tab.id === 'general');
      expect(general, `${metadata.key} should declare a General tab`).toBeDefined();
      expect(general?.label).toBe('General');
      expect(general?.icon).toBe('info-circle');
      expect(general?.layout).toBe('form');
    }
  });

  it('gives every metadata-driven entry form the same standard Save/Delete lifecycle actions', () => {
    const entries = Object.values(allSysBOUIMetadata);
    expect(entries.length).toBeGreaterThan(0);

    for (const metadata of entries) {
      const actions = Object.values(metadata.record.entryActions || {});
      expect(actions.some((action) => action.kind === 'save'), `${metadata.key} should expose the standard Save action`).toBe(true);
      expect(actions.some((action) => action.kind === 'delete'), `${metadata.key} should expose the standard Delete action`).toBe(true);
    }
  });

  it('keeps common action placement generic and lets SysUser own-record delete policy stay declarative', () => {
    for (const metadata of Object.values(allSysBOUIMetadata)) {
      const deleteAction = Object.values(metadata.record.entryActions || {}).find((action) => action.kind === 'delete');
      const saveAction = Object.values(metadata.record.entryActions || {}).find((action) => action.kind === 'save');

      expect(deleteAction?.placement, `${metadata.key} Delete should use the common leading footer region`).toBe('footer-leading');
      expect(saveAction?.placement, `${metadata.key} Save should use the common trailing footer region`).toBe('footer-trailing');
    }

    const sysUser = allSysBOUIMetadata['sys-users'];
    expect(sysUser.record.entryActions?.delete?.enabled).toEqual({
      expression: "id !== user.fields.id.value",
    });
    expect(sysUser.record.entryActions?.delete?.disabledReason).toEqual({
      expression:
        "id === user.fields.id.value ? 'You cannot delete your own user account.' : null",
    });
    expect(sysUser.record.entryActions?.verifyEmail).toMatchObject({
      kind: 'command',
      command: 'verify-email',
      placement: 'footer-leading',
      label: 'Verify email',
      icon: 'envelope-check',
      tone: 'success',
      emphasis: 'outline',
    });
  });

  it('provides safe create defaults for Applications and Licenses without entity-specific renderer logic', () => {
    const applications = allSysBOUIMetadata['sys-applications'];
    const licenses = allSysBOUIMetadata['sys-licenses'];

    expect(applications.record.fieldOverrides.enabled?.createDefaultValue).toBe(true);
    expect(licenses.record.fieldOverrides.name?.label).toBe('License name');
    expect(licenses.record.fieldOverrides.platformId?.createDefaultValue).toEqual({
      expression: "FirstCtx(platformId.options, 'value')",
    });
    expect(sysBOLicensesMetadata.fieldDefinition.platformId?.enumItems?.[0]).toMatchObject({
      value: expect.any(String),
      label: 'mCRM',
    });
    expect(licenses.record.fieldOverrides.status?.createDefaultValue).toBe('Active');
    expect(licenses.record.fieldOverrides.validFrom?.createDefaultValue).toEqual({ expression: 'CurrentDay()' });
    expect(licenses.record.fieldOverrides.quantity?.createDefaultValue).toBe(1);
    expect(licenses.record.fieldOverrides.enabled?.createDefaultValue).toBe(true);

    const contents = licenses.record.tabs.find((tab) => tab.id === 'contents');
    expect(contents).toMatchObject({
      label: 'Contents',
      order: 20,
      icon: 'box-seam',
      layout: 'form',
      fields: ['platformId', 'applicationId', 'rules'],
    });
    expect(licenses.list.filterFields).toEqual([
      'name',
      'principalId',
      'platformId',
      'applicationId',
      'status',
      'enabled',
    ]);

    const principalLicenses = allSysBOUIMetadata['sys-principals'].record.relatedCollections?.licenses;
    const applicationLicenses = applications.record.relatedCollections?.licenses;
    expect(principalLicenses).toMatchObject({
      entityKey: 'sys-licenses',
      layout: 'table-list',
      rowHref: '/bo/sys-licenses/{id}',
      source: { kind: 'entity-query', filterField: 'principalId', currentField: 'id' },
    });
    expect(applicationLicenses).toMatchObject({
      entityKey: 'sys-licenses',
      layout: 'table-list',
      source: { kind: 'entity-query', filterField: 'applicationId', currentField: 'id' },
    });
  });

});
