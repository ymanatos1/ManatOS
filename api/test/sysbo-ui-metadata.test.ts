import { describe, expect, it } from 'vitest';
import { sysBOApplicationsMetadata, sysBOLicensesMetadata } from '@manatos/shared';

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


  it('places Enabled second in every General tab after the entity identity field', () => {
    for (const metadata of Object.values(allSysBOUIMetadata)) {
      const general = metadata.record.tabs.find((tab) => tab.id === 'general');
      expect(general, `${metadata.key} should declare General`).toBeDefined();
      expect(general?.fields[1], `${metadata.key} should place Enabled second`).toBe('enabled');

      if (general?.content?.length) {
        const fieldContent = general.content.filter((content) => content.kind === 'field');
        expect(fieldContent[0]).toMatchObject({ kind: 'field', field: metadata.key === 'sys-ext-auth-providers' ? 'provider' : 'name' });
        expect(fieldContent[1]).toMatchObject({ kind: 'field', field: 'enabled' });
      } else {
        expect(general?.fields[0]).toBe(metadata.key === 'sys-ext-auth-providers' ? 'provider' : 'name');
      }
    }
  });


  it('keeps the User General tab identity/state first, then Email and Telephone before a dedicated Description row', () => {
    const user = allSysBOUIMetadata['sys-users'];
    const general = user.record.tabs.find((tab) => tab.id === 'general');

    expect(general?.fields.slice(0, 5)).toEqual(['name', 'enabled', 'email', 'telephoneNumber', 'description']);
    expect(general?.fields.indexOf('description')).toBeLessThan(general?.fields.indexOf('firstName') ?? -1);
    expect(general?.content?.slice(0, 6)).toEqual([
      { kind: 'field', field: 'name', span: 6 },
      { kind: 'field', field: 'enabled', span: 6 },
      { kind: 'field', field: 'email', span: 6 },
      { kind: 'field', field: 'telephoneNumber', span: 6 },
      { kind: 'break' },
      { kind: 'field', field: 'description', span: 12 },
    ]);
  });

  it('lets form metadata reserve grid space and aligns Principal root/parent on one row', () => {
    const principal = allSysBOUIMetadata['sys-principals'];
    const general = principal.record.tabs.find((tab) => tab.id === 'general');

    expect(general?.fields).toEqual([
      'name',
      'enabled',
      'description',
      'principalType',
      'parentId',
      'rootPrincipalId',
    ]);
    expect(principal.record.fieldOverrides.principalType?.createDefaultValue).toBe('Person');
    expect(general?.content).toEqual([
      { kind: 'field', field: 'name', span: 6 },
      { kind: 'field', field: 'enabled', span: 6 },
      { kind: 'field', field: 'description', span: 12 },
      { kind: 'field', field: 'principalType', span: 6 },
      { kind: 'spacer', span: 6 },
      { kind: 'field', field: 'parentId', span: 6 },
      { kind: 'field', field: 'rootPrincipalId', span: 6 },
    ]);
  });

  it('keeps Application identity simple and gives Full name/Description dedicated rows', () => {
    const application = allSysBOUIMetadata['sys-applications'];
    const general = application.record.tabs.find((tab) => tab.id === 'general');

    expect(application.list.visibleFields).toEqual(['name', 'fullName', 'version', 'enabled']);
    expect(application.list.filterFields).toEqual(['name', 'fullName']);
    expect(sysBOApplicationsMetadata.fieldDefinition.version).toMatchObject({
      type: 'version',
      versionFormat: 'semver',
    });
    expect(general?.fields).toEqual(['name', 'enabled', 'fullName', 'description', 'version']);
    expect(general?.content).toEqual([
      { kind: 'field', field: 'name', span: 6 },
      { kind: 'field', field: 'enabled', span: 6 },
      { kind: 'field', field: 'fullName', span: 12 },
      { kind: 'field', field: 'description', span: 12 },
      { kind: 'field', field: 'version', span: 6 },
    ]);
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

  it('keeps standard entry and list lifecycle authorization declarative in evaluator-backed metadata', () => {
    for (const metadata of Object.values(allSysBOUIMetadata)) {
      const deleteAction = Object.values(metadata.record.entryActions || {}).find((action) => action.kind === 'delete');
      const saveAction = Object.values(metadata.record.entryActions || {}).find((action) => action.kind === 'save');

      expect(deleteAction?.visible).toEqual({
        expression: "mode !== 'create' && permissions.delete === true",
      });
      expect(saveAction?.visible).toEqual({
        expression: "mode !== 'view' && (permissions.create === true || permissions.edit === true)",
      });
      expect(metadata.list.addAction.visible).toEqual({
        expression: 'permissions.create === true',
      });
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
    expect(sysBOLicensesMetadata.fieldDefinition.validFrom?.type).toBe('date');
    expect(sysBOLicensesMetadata.fieldDefinition.validUntil?.type).toBe('date');
    expect(sysBOLicensesMetadata.fieldDefinition.validityDuration).toMatchObject({
      type: 'duration',
      nullable: true,
      durationUnits: ['years', 'months', 'days'],
      calculation: {
        expression: 'CalendarDurationBetween(validFrom, validUntil)',
        triggeredBy: ['validUntil'],
      },
    });
    expect(sysBOLicensesMetadata.fieldDefinition.validUntil?.calculation).toEqual({
      expression: 'CalendarAddDuration(validFrom, validityDuration)',
      triggeredBy: ['validFrom', 'validityDuration'],
    });
    const general = licenses.record.tabs.find((tab) => tab.id === 'general');
    const contents = licenses.record.tabs.find((tab) => tab.id === 'contents');
    const validityComponent = {
      kind: 'component',
      span: 12,
      component: {
        key: 'date-duration-range',
        readOnly: false,
        options: {
          startField: 'validFrom',
          durationField: 'validityDuration',
          endField: 'validUntil',
        },
      },
    };

    // The validity trio intentionally lives at the top of Contents. Protect both
    // sides of that presentation contract so it cannot drift back into General.
    expect(general?.content).not.toContainEqual(validityComponent);
    expect(contents?.content?.[0]).toEqual(validityComponent);
    expect(general?.content).toContainEqual({ kind: 'field', field: 'description', span: 12 });
    expect(licenses.record.fieldOverrides.quantity?.createDefaultValue).toBe(1);
    expect(licenses.record.fieldOverrides.enabled?.createDefaultValue).toBe(true);

    expect(contents).toMatchObject({
      label: 'Contents',
      order: 20,
      icon: 'box-seam',
      layout: 'form',
      fields: ['validFrom', 'validityDuration', 'validUntil', 'platformId', 'applicationId', 'rules'],
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

  it('declares provider help and credential workflow as reusable tab content components', () => {
    const providers = allSysBOUIMetadata['sys-ext-auth-providers'];
    const general = providers.record.tabs.find((tab) => tab.id === 'general');
    const secrets = providers.record.tabs.find((tab) => tab.id === 'secrets');

    expect(general?.content).toContainEqual({
      kind: 'component',
      span: 12,
      component: {
        key: 'contextual-help',
        readOnly: true,
        bindings: { selectedKey: { expression: 'provider.value' } },
        options: {
          itemsDataKey: 'providerDefinitions',
          itemKey: 'provider',
          contentKey: 'generalHelp',
          collapsible: true,
          initiallyCollapsed: true,
        },
      },
    });
    expect(secrets?.layout).toBe('form');
    expect(secrets?.content?.[0]).toEqual({
      kind: 'component',
      span: 12,
      component: { key: 'provider-credentials', readOnly: false },
    });
    expect(secrets?.content).toContainEqual({
      kind: 'component',
      span: 12,
      component: {
        key: 'contextual-help',
        readOnly: true,
        bindings: { selectedKey: { expression: 'provider.value' } },
        options: {
          itemsDataKey: 'providerDefinitions',
          itemKey: 'provider',
          contentKey: 'secretsHelp',
          collapsible: true,
          initiallyCollapsed: true,
        },
      },
    });
    expect(providers.record.fieldOverrides.callbackPath?.helpText).toContain('PUBLIC_BASE_URL');
    expect(providers.record.fieldOverrides.enabled?.createDefaultValue).toBe(true);
  });

});
