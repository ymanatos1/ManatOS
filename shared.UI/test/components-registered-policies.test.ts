import { describe, expect, it } from 'vitest';
import { createUiFieldBehavior, uiFieldBehavior } from '../src/components/fields/registry.js';
import {
  deriveEntryFieldState,
  entryAvailableOptions,
} from '../src/components/entry/EntryEditState.js';
import { uiListFilterFields } from '../src/components/list/ListMetadata.js';

/** Acceptance: adding a Field requires only a registered component, not a host type switch. */
describe('registered Field policy contract', () => {
  it('every installed behavior implements editing, validation and filter capabilities', () => {
    expect(uiFieldBehavior.size).toBe(15);
    for (const [type, constructor] of uiFieldBehavior) {
      const instance = new constructor();
      expect(instance.type).toBe(type);
      expect(typeof instance.editable).toBe('boolean');
      expect(typeof instance.validate).toBe('function');
      expect(typeof instance.filterOptions).toBe('function');
    }
  });

  it('an Entry delegates editing policy and validation to its Field', () => {
    const original = { name: 'Tester', email: 'a@b.com', enabled: true, role: 'User' };
    const options = entryAvailableOptions('sys-users', 'EN');
    const state = deriveEntryFieldState(
      'sys-users',
      original,
      { ...original, email: '' },
      'edit',
      { update: true },
      options,
    );
    expect(createUiFieldBehavior('sys-users', 'email').editable).toBe(true);
    expect(state.fields.email).toMatchObject({
      editable: true,
      valid: false,
      issues: ['Required value'],
    });
    expect(
      createUiFieldBehavior('sys-users', 'role').validate('Unknown', false, options.role ?? []),
    ).toContain('Invalid option');
  });

  it('List options originate from the same per-type policies, including translations', () => {
    const options = uiListFilterFields('sys-users', 'EL');
    const role = options.find((item) => item.field === 'role');
    expect(role?.options).toEqual(createUiFieldBehavior('sys-users', 'role').filterOptions('EL'));
    expect(createUiFieldBehavior('sys-users', 'enabled').filterOptions('EL')).toEqual([
      { value: 'true', label: 'Ναι' },
      { value: 'false', label: 'Όχι' },
    ]);
  });
});
