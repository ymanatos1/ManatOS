import { describe, expect, it } from 'vitest';

import {
  describeRelatedCollectionField,
  resolveProjectedRelatedCollectionValue,
} from '../../src/presentation/metadata/related-field-presentation.js';

describe('related collection field presentation boundary', () => {
  it('uses the already-projected row value when no UI-only expression is declared', () => {
    const row = { validUntil: '2026-11-30' };

    expect(resolveProjectedRelatedCollectionValue(row, 'validUntil', {})).toEqual({
      raw: '2026-11-30',
      tone: null,
      icon: null,
      calculated: false,
      expression: null,
      toneExpression: null,
      iconExpression: null,
      sourceField: 'validUntil',
    });
  });

  it('treats only an explicitly authored collection expression as a presentation calculation', () => {
    const field = {
      sourceField: 'status',
      expression: "status == 'Active' ? 'Current' : 'Inactive'",
      presentation: {
        tone: { expression: "status == 'Active' ? 'success' : 'secondary'" },
        icon: 'check-circle',
      },
    };

    expect(describeRelatedCollectionField('displayStatus', field)).toEqual({
      sourceField: 'status',
      valueExpression: "status == 'Active' ? 'Current' : 'Inactive'",
      toneExpression: "status == 'Active' ? 'success' : 'secondary'",
      iconExpression: null,
      staticTone: null,
      staticIcon: 'check-circle',
    });
    expect(
      resolveProjectedRelatedCollectionValue({ status: 'Active' }, 'displayStatus', field).raw,
    ).toBeUndefined();
  });
});
