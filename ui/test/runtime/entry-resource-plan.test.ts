import { describe, expect, it } from 'vitest';

import {
  allSysBOMetadata,
  allSysBOUIMetadata,
  resolveSysBOUIView,
  type SysBOMetadata,
} from '@manatos/shared';

import { planEntryResources } from '../../src/routes/sysbo/entry/resource-plan.js';

describe('effective entry ui-view resource planning', () => {
  it('derives quick-view demand from resolved composition rather than the view name', () => {
    const bo = allSysBOMetadata['sys-users'] as unknown as SysBOMetadata<Record<string, unknown>>;
    const ui = resolveSysBOUIView(allSysBOUIMetadata['sys-users'], 'quickView').metadata;
    const plan = planEntryResources(bo, ui);

    expect(plan.fieldKeys).toContain('principalId');
    expect(plan.referenceFieldKeys).toEqual(new Set(['principalId']));
    expect(plan.collectionKeys).toContain('externalIdentities');
    expect(plan.actionKeys).not.toContain('delete');
    expect(plan.actionKeys).not.toContain('save');
  });

  it('discovers component-owned collection sources and hierarchy resources recursively', () => {
    const bo = allSysBOMetadata['sys-principals'] as unknown as SysBOMetadata<
      Record<string, unknown>
    >;
    const ui = resolveSysBOUIView(allSysBOUIMetadata['sys-principals'], 'main').metadata;
    const plan = planEntryResources(bo, ui);

    expect([...plan.collectionKeys].sort()).toEqual(
      expect.arrayContaining(['emailAddresses', 'telephoneNumbers', 'addresses']),
    );
    expect(plan.componentKeys).toContain('collection-editor');
    expect(plan.componentKeys).toContain('hierarchy-tree');
  });

  it('suppresses mutating action resources when the effective surface is readonly', () => {
    const bo = allSysBOMetadata['sys-users'] as unknown as SysBOMetadata<Record<string, unknown>>;
    const ui = resolveSysBOUIView(allSysBOUIMetadata['sys-users'], 'main').metadata;
    const plan = planEntryResources(bo, ui, true);

    expect(plan.actionKeys).not.toContain('delete');
    expect(plan.actionKeys).not.toContain('save');
    expect(plan.actionKeys).not.toContain('verifyEmail');
  });

  it('does not plan resources from statically hidden tabs', () => {
    const bo = allSysBOMetadata['sys-users'] as unknown as SysBOMetadata<Record<string, unknown>>;
    const base = resolveSysBOUIView(allSysBOUIMetadata['sys-users'], 'quickView').metadata;
    const ui = {
      ...base,
      record: {
        ...base.record,
        tabs: [
          ...base.record.tabs,
          {
            id: 'hidden',
            label: 'Hidden',
            order: 999,
            visible: false as const,
            fields: ['telephoneNumber'],
          },
        ],
      },
    };

    expect(planEntryResources(bo, ui).fieldKeys).not.toContain('telephoneNumber');
  });
});
