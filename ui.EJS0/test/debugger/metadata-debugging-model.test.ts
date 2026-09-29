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
    expect(valueRow?.row.valuePath).toBe('ctx.ui.level.data.fields.fullName.value');
    expect(valueRow?.row).not.toHaveProperty('ast');
  });

  it('returns no expression rows when developer Debugging is disabled', () => {
    const model = buildMetadataDebuggingModel({ ...baseInput(), debuggingTabEnabled: false });
    expect(model.entityDebuggingDisplayRows).toEqual([]);
    expect(model.uiDebuggingDisplayRows).toEqual([]);
  });

  it('keeps canonical calculations of related entities out of the host debugging inventory', () => {
    const model = buildMetadataDebuggingModel({
      ...baseInput(),
      relatedCollections: {
        licenses: {
          entityKey: 'sys-licenses',
          fields: {
            validUntil: {},
            displayValue: { expression: "name + ' / ' + status" },
          },
        },
      },
    });

    const rows = [...model.entityDebuggingDisplayRows, ...model.uiDebuggingDisplayRows]
      .filter((row: any) => row.type === 'value')
      .map((row: any) => row.row);

    expect(rows.some((row: any) => row.name === 'licenses.validUntil')).toBe(false);
    expect(rows.some((row: any) => row.group === 'RELATED ENTITY')).toBe(false);
    expect(rows).toContainEqual(
      expect.objectContaining({
        group: 'UI',
        subgroup: 'RELATED',
        name: 'relatedCollections.licenses.fields.displayValue.expression',
        formula: "name + ' / ' + status",
      }),
    );
  });
});
