import { describe, expect, it, vi } from 'vitest';

import { buildMetadataDebuggingModel } from '../../src/presentation/metadata/debugging-model.js';

const baseInput = () => ({
  debuggingTabEnabled: true,
  metadata: {
    fieldDefinition: {
      firstName: {},
      fullName: { calculation: { expression: "firstName + ' Test'" } },
    },
  },
  metadataUI: { record: { tabs: [], entryActions: {} } },
  compiledEntityContextName: 'SysUser',
  ctxFields: { firstName: { value: 'Ada' }, fullName: { value: 'Ada Test' } },
  ctxValue: (key: string) =>
    key === 'fullName' ? 'Ada Test' : key === 'firstName' ? 'Ada' : undefined,
  dynamicUIValue: vi.fn((value: unknown) => value),
  overrides: {},
  relatedCollections: {},
  relatedMetadataRegistry: {},
});

describe('metadata Debugging model', () => {
  it('builds entity calculation rows outside the EJS renderer', () => {
    const model = buildMetadataDebuggingModel(baseInput());
    const valueRow = model.entityDebuggingDisplayRows.find(
      (row: any) => row.type === 'value' && row.row?.name === 'fullName.calculation',
    );

    expect(valueRow?.row.formula).toBe("firstName + ' Test'");
    expect(valueRow?.row.value).toBe("'Ada Test'");
    expect(valueRow?.row.detailGroup).toBe('DECLARED FIELDS');
    expect(valueRow?.row.definitionPath).toBe(
      'ctx.entities.SysUser.metadata.fieldDefinition.fullName.calculation.expression',
    );
    expect(valueRow?.row.valuePath).toBe('ctx.ui.level.entry.fullName');
    expect(valueRow?.row).not.toHaveProperty('ast');
  });

  it('returns no expression rows when developer Debugging is disabled', () => {
    const model = buildMetadataDebuggingModel({ ...baseInput(), debuggingTabEnabled: false });
    expect(model.entityDebuggingDisplayRows).toEqual([]);
    expect(model.uiDebuggingDisplayRows).toEqual([]);
  });
});
