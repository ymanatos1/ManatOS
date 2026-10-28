import { describe, expect, it } from 'vitest';
import { entryFieldOptions, resolveEntryOptions, uiEntryFieldPresentation } from '../src/index.js';

describe('canonical shared field option sources', () => {
  it('resolves the installed subsystem enum in EN/EL without Entry data copies', () => {
    const english = entryFieldOptions('sys-users', 'role', 'EN');
    const greek = entryFieldOptions('sys-users', 'role', 'EL');
    expect(english.find((item) => item.value === 'Admin')?.label).toBe('Admin');
    expect(greek.find((item) => item.value === 'User')?.label).toBe('Χρήστης');
    expect(uiEntryFieldPresentation('sys-users', 'role', 'User', 'EL')?.options).toEqual(greek);
  });

  it('uses the exact same resolver for inline entity-field option definitions', () => {
    const field = {
      type: 'enum' as const,
      enumItems: [
        { value: 'a', label: { EN: 'First', EL: 'Πρώτο' }, icon: 'star' },
        { value: 'b', label: { EN: 'Second', EL: 'Δεύτερο' } },
      ],
    };
    expect(resolveEntryOptions(field, 'EN').map((item) => item.label)).toEqual(['First', 'Second']);
    expect(resolveEntryOptions(field, 'EL').map((item) => item.label)).toEqual([
      'Πρώτο',
      'Δεύτερο',
    ]);
  });

  it('preserves optional icon metadata across rich and value-only inline options', () => {
    const rich = resolveEntryOptions(
      {
        type: 'enum',
        enumItems: [
          { value: 'with-icon', label: 'With icon', icon: 'star' },
          { value: 'without-icon', label: 'Without icon' },
        ],
      },
      'EN',
    );
    expect(rich).toEqual([
      { value: 'with-icon', label: 'With icon', icon: 'star' },
      { value: 'without-icon', label: 'Without icon' },
    ]);
    expect(resolveEntryOptions({ type: 'enum', enumValues: ['one', 'two'] }, 'EN')).toEqual([
      { value: 'one', label: 'one' },
      { value: 'two', label: 'two' },
    ]);
  });

  it('retains canonical enum-option policy traits used by metadata field editability', () => {
    const options = entryFieldOptions('sys-principals', 'principalType', 'EN');
    expect(options.map((option) => [option.value, Reflect.get(option, 'canHaveParent')])).toEqual([
      ['Person', true],
      ['Company', false],
      ['Group', true],
      ['System', true],
    ]);
    expect(
      resolveEntryOptions(
        {
          type: 'enum',
          enumItems: [{ value: 'custom', label: 'Custom', canHaveParent: true }],
        },
        'EN',
      ).map((option) => Reflect.get(option, 'canHaveParent')),
    ).toEqual([true]);
  });

  it('does not disguise an invalid explicit enum reference with inline fallbacks', () => {
    expect(
      resolveEntryOptions({ type: 'enum', enum: 'DoesNotExist', enumValues: ['fallback'] }, 'EN'),
    ).toEqual([]);
  });
});
