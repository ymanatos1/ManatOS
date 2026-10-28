import { describe, expect, it } from 'vitest';
import { ContextTreeRuntime, type ManatOSRuntimeRootContext } from '@manatos/shared';
import {
  uiEntryTabs,
  uiEntryRelatedCollection,
  uiEntryRelatedViews,
  uiEntryRelatedListProjection,
  createUiFieldBehavior,
  uiEntryRelatedCell,
  uiEntrySummaryRows,
  UiEntryPageRuntime,
  type UiSurfaceResourceRequest,
} from '../src/index.js';

describe('Entry System Details and related-collection migration', () => {
  const principalId = '11111111-1111-4111-8111-111111111111';
  const relationshipId = '22222222-2222-4222-8222-222222222222';
  const emailId = '33333333-3333-4333-8333-333333333333';

  it('projects the summary contract and component-owned collection positions', () => {
    const tabs = uiEntryTabs('sys-principals', 'EN', {
      mode: 'edit',
      permissions: { update: true },
    });
    const system = tabs.find((tab) => tab.id === 'system');
    expect(system?.layoutMode).toBe('summary');
    expect(system?.layout[0]).toMatchObject({
      kind: 'summary',
      fields: ['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
    });
    expect(tabs.find((tab) => tab.id === 'contact')?.layout).toMatchObject([
      { kind: 'collection', reference: 'emailAddresses', span: 6 },
      { kind: 'collection', reference: 'telephoneNumbers', span: 6 },
      { kind: 'collection', reference: 'addresses', span: 12 },
    ]);
    expect(
      uiEntryTabs('sys-applications')
        .find((tab) => tab.id === 'licenses')
        ?.layout.some((item) => item.kind === 'collection'),
    ).toBe(true);
  });

  it('formats persisted timestamps in local time and not as editable datetime inputs', () => {
    const rows = uiEntrySummaryRows(
      'sys-principals',
      ['createdAt', 'createdBy'],
      {
        createdAt: '2026-08-30T12:10:00.000Z',
        createdBy: 'Admin',
      },
      'EN',
    );
    expect(rows[0]?.text).toContain(
      new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date('2026-08-30T12:10:00.000Z'),
      ),
    );
    expect(rows[1]?.text).toBe('Admin');
  });

  it('uses inherited related-list views, typed columns, and canonical formatted values', () => {
    const licenses = uiEntryRelatedCollection('sys-applications', 'licenses');
    expect(licenses?.entityKey).toBe('sys-licenses');
    const views = uiEntryRelatedViews(licenses!, 'EN');
    expect(
      views.find((view) => view.key === 'default')?.columns.map((column) => column.field),
    ).toContain('applicationId');
    expect(uiEntryRelatedCell(licenses!, { enabled: true }, 'enabled', 'EN')).toBe('Enabled');
    expect(uiEntryRelatedCollection('sys-applications', 'unknown')).toBeNull();
  });

  it('uses canonical List field formatting and keeps related-view ownership in Entry CTX', async () => {
    const collection = uiEntryRelatedCollection('sys-applications', 'licenses');
    expect(collection).not.toBeNull();
    const defaultView = uiEntryRelatedViews(collection!, 'EN').find(
      (view) => view.key === 'default',
    );
    expect(defaultView).toBeDefined();
    const licenseId = '44444444-4444-4444-8444-444444444444';
    const projected = uiEntryRelatedListProjection(defaultView!, [
      { id: licenseId, name: 'Sample license', status: 'Active', enabled: true },
    ]);
    expect(projected.columns.map((column) => column.field)).toContain('enabled');
    const field = createUiFieldBehavior('sys-licenses', 'enabled');
    expect(field.formatHtml(projected.rows[0]?.['enabled'], 'EN', projected.rows[0])).toContain(
      'manatos-field-badge',
    );
    const tree = new ContextTreeRuntime({
      ui: {},
    }) as unknown as ContextTreeRuntime<ManatOSRuntimeRootContext>;
    const port = {
      request: async <T>(request: UiSurfaceResourceRequest): Promise<T> => {
        if (request.kind === 'sysbo.entry')
          return { id: principalId, name: 'Example', __surfaceCapabilities: { read: true } } as T;
        if (request.kind === 'sysbo.list')
          return {
            items: [{ id: licenseId, name: 'Sample license', enabled: true }],
            paging: { page: 1, total: 1 },
          } as T;
        if (request.kind === 'sysbo.references') return {} as T;
        throw new Error(`Unexpected request ${request.kind}`);
      },
    };
    const entry = new UiEntryPageRuntime(tree, 'sys-applications', principalId, port, {
      mode: 'view',
    });
    try {
      for (
        let attempt = 0;
        attempt < 40 && entry.level.data.relatedCollections?.licenses?.loading !== false;
        attempt++
      )
        await new Promise((resolve) => setTimeout(resolve, 10));
      const before = JSON.stringify(entry.level.layout);
      expect(before).toContain('ListColumnsRow');
      expect(before).toContain('ListRow0');
      expect(before).toContain('ListCell6');
      entry.setRelatedView('licenses', 'compact');
      expect(entry.level.data.relatedCollections?.licenses?.viewKey).toBe('compact');
      const after = JSON.stringify(entry.level.layout);
      expect(after).toContain('ListCell2');
      expect(after).not.toContain('ListCell6');
      entry.setRelatedView('licenses', 'invalid-view');
      expect(entry.level.data.relatedCollections?.licenses?.viewKey).toBe('compact');
    } finally {
      entry.dispose();
    }
  });

  it('loads junction-backed contact rows through the authenticated List and reference contracts', async () => {
    const calls: UiSurfaceResourceRequest[] = [];
    const port = {
      request: async <T>(request: UiSurfaceResourceRequest): Promise<T> => {
        calls.push(request);
        if (request.kind === 'sysbo.entry')
          return {
            id: principalId,
            name: 'Principal',
            __surfaceCapabilities: { read: true, update: true },
          } as T;
        if (request.kind === 'sysbo.list')
          return {
            items:
              request.entityKey === 'sys-principal-email-addresses'
                ? [{ id: relationshipId, principalId, emailAddressId: emailId }]
                : [],
            paging: { page: 1, total: 1 },
          } as T;
        if (request.kind === 'sysbo.references')
          return {
            'sys-email-addresses': { [emailId]: { id: emailId, address: 'contact@example.com' } },
          } as T;
        throw new Error(`Unexpected request ${request.kind}`);
      },
    };
    const tree = new ContextTreeRuntime({
      ui: {},
    }) as unknown as ContextTreeRuntime<ManatOSRuntimeRootContext>;
    const entry = new UiEntryPageRuntime(tree, 'sys-principals', principalId, port, {
      mode: 'edit',
    });
    for (
      let i = 0;
      i < 40 && entry.level.data.relatedCollections?.emailAddresses?.loading !== false;
      i++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(calls).toContainEqual({
      kind: 'sysbo.list',
      entityKey: 'sys-principal-email-addresses',
      query: { page: '1', pageSize: '100', 'filter.principalId': principalId },
    });
    expect(calls.some((call) => call.kind === 'sysbo.references')).toBe(true);
    expect(entry.level.data.relatedCollections?.emailAddresses?.rows).toMatchObject([
      { id: emailId, address: 'contact@example.com', __relationshipId: relationshipId },
    ]);
    expect(entry.level.data.current?.id).toBe(principalId);
    entry.dispose();
  });
});
