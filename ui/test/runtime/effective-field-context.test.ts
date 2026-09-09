import { describe, expect, it } from 'vitest';

import { resolveEffectiveFieldContext } from '../../src/runtime/resolvers/effective-field-context-resolver.js';

describe('V2 effective field context', () => {
  it('projects one authoritative readonly/editability decision', () => {
    const context = resolveEffectiveFieldContext({
      name: 'name',
      originalValue: 'Mitsos group',
      value: 'Mitsos group',
      dirty: false,
      valid: true,
      validationIssues: [],
      ux: { readonly: true, visible: true, required: true, enabled: true },
    });

    expect(context).toMatchObject({
      value: 'Mitsos group',
      originalValue: 'Mitsos group',
      editable: false,
      readonly: true,
      visible: true,
      required: true,
    });
  });

  it('resolves the selected reference once from the canonical catalogue', () => {
    const manatos = { id: 'principal-manatos', value: 'principal-manatos', label: 'ManatOS' };
    const context = resolveEffectiveFieldContext(
      {
        name: 'parentId',
        originalValue: 'principal-manatos',
        value: 'principal-manatos',
        dirty: false,
        valid: true,
        validationIssues: [],
        ux: { readonly: true, visible: true, required: false, enabled: true },
      },
      [manatos],
    );

    expect(context.reference?.selected).toBe(manatos);
    expect(context.editable).toBe(false);
  });
});
