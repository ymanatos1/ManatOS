import {
  allowedInvocationOptionValues,
  isEmptyEntryFieldValue,
  reconcileRestrictedOptionValue,
  staticEntryFieldUx,
} from '@manatos/shared';
import { describe, expect, it } from 'vitest';

describe('shared V2 entry-field policy', () => {
  it('owns static field UX restrictions for semantic and browser runtimes', () => {
    expect(staticEntryFieldUx('edit', false, { visible: false, editable: false })).toEqual({
      visible: false,
      editable: false,
    });
    expect(staticEntryFieldUx('view', false, { visible: true, editable: true })).toEqual({
      visible: true,
      editable: false,
    });
    expect(staticEntryFieldUx('edit', true, { editable: true })).toEqual({
      visible: true,
      editable: false,
    });
  });

  it('owns enum option-domain reconciliation without host-specific default guesses', () => {
    const field = {
      type: 'enum' as const,
      enumItems: [
        { value: 'a', label: 'A', preferred: false },
        { value: 'b', label: 'B', preferred: true },
      ],
    };
    expect(allowedInvocationOptionValues(field, { allowedValues: ['b'] })).toEqual(['b']);
    const allowed = allowedInvocationOptionValues(field, { allowedEnumItemTrait: 'preferred' });
    expect(allowed).toEqual(['b']);
    expect(reconcileRestrictedOptionValue('b', allowed)).toBe('b');
    expect(reconcileRestrictedOptionValue('a', allowed)).toBe('b');
    expect(reconcileRestrictedOptionValue(null, [])).toBeNull();
  });

  it('uses one empty-value definition for create-default eligibility', () => {
    expect([null, undefined, ''].every(isEmptyEntryFieldValue)).toBe(true);
    expect(isEmptyEntryFieldValue(false)).toBe(false);
    expect(isEmptyEntryFieldValue(0)).toBe(false);
  });
});
