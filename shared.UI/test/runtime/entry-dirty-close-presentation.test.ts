import { describe, expect, it } from 'vitest';
import { entryDirtyClosePresentation, type UiEntryLevel } from '../../src/index.js';

describe('Entry dirty-close presentation', () => {
  it('does not duplicate data and produces a read-only review from the live Entry', () => {
    const original = {
      id: 'user-1',
      firstName: 'Original',
      lastName: 'Name',
      fullName: 'Original Name',
    };
    const current = { ...original, firstName: 'Changed' };
    const level = {
      control: {
        kind: 'entry',
        entityName: '@EN.manatos.auth.users.label.User',
        invocation: { params: { entityKey: 'sys-users', recordId: 'user-1' } },
      },
      state: { entry: { dirty: true, caption: 'Edit User - Original Name' } },
      data: { original, current, references: {} },
    } as unknown as UiEntryLevel;
    const presentation = entryDirtyClosePresentation(level, 'EN');
    expect(presentation.ownerLabel).toBe(level.control.entityName);
    const report = presentation.reviewChanges?.();
    expect(report?.count).toBe(1);
    expect(report?.nodes[0]?.label).toBe('Edit User - Original Name');
    expect(report?.localized?.EL).toBeDefined();
    expect(level.data.current?.firstName).toBe('Changed');
    current.firstName = 'Original';
    expect(presentation.reviewChanges?.()?.count).toBe(0);
  });
});
