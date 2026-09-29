import { readFileSync } from 'node:fs';
import {
  resolveSysBOUIView,
  sysBOLicensesMetadata,
  sysBOLicensesUIMetadata,
  tabContentKeys,
} from '@manatos/shared';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('V2 License rich-entry acceptance', () => {
  it('keeps License composition declarative while accepted generic V2 entry infrastructure owns state', () => {
    const renderer = source('../../src/routes/sysbo/entry/renderer.ts');
    const rangeComponent = source(
      '../../views/components/sysbo/entry/content/date-duration-range.ejs',
    );
    const genericRepresentation = source(
      '../../views/components/sysbo/entry/fields/field-representation.ejs',
    );
    const formRuntime = source('../../public/js/sysbo/entry/form-runtime.js');
    const policyRuntime = source('../../public/js/sysbo/entry/entry-policy-runtime.js');
    const contentsTab = sysBOLicensesUIMetadata.record?.tabs?.find((tab) => tab.id === 'contents');

    expect(sysBOLicensesMetadata.fieldDefinition.platformId?.createDefaultValue).toEqual({
      expression: "FirstCtx($entity-fields.platformId.enumItems, 'value')",
    });
    expect(sysBOLicensesMetadata.fieldDefinition.validFrom?.createDefaultValue).toEqual({
      expression: 'CurrentDay()',
    });
    expect(sysBOLicensesMetadata.fieldDefinition.status?.createDefaultValue).toBe('Active');
    expect(contentsTab?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'component',
          component: expect.objectContaining({ key: 'date-duration-range' }),
        }),
      ]),
    );
    expect(sysBOLicensesMetadata.fieldDefinition.validUntil?.calculation?.expression).toBe(
      'validFrom == null || validityDuration == null ? null : CalendarAddDuration(validFrom, validityDuration)',
    );
    expect(sysBOLicensesMetadata.fieldDefinition.validityDuration?.calculation?.expression).toBe(
      'validFrom == null || validUntil == null ? null : CalendarDurationBetween(validFrom, validUntil)',
    );
    expect(rangeComponent).not.toContain('CalendarAddDuration');
    expect(rangeComponent).not.toContain('CalendarDurationBetween');
    expect(renderer).not.toContain("definition.key === 'sys-licenses'");
    expect(renderer).not.toContain("definition.key === 'sys-license'");
    expect(genericRepresentation).toContain("format: 'datetime-elapsed'");
    expect(genericRepresentation).toContain("format: 'date'");
    expect(genericRepresentation).toContain('data-v2-summary-raw-value');
    expect(genericRepresentation).toContain('safeRelatedValues[0]');
    expect(formRuntime).toContain('JSON.stringify(initialValue) === JSON.stringify(field.value)');
    expect(policyRuntime).toContain('if (!hasToneExpression && !hasIconExpression) continue');
  });

  it('declares the standard read-only License Quick View without a License-specific renderer', () => {
    const quickView = resolveSysBOUIView(sysBOLicensesUIMetadata, 'quickView');

    expect(quickView.viewType).toBe('quick');
    expect(quickView.metadata.record.readOnly).toBe(true);
    expect(quickView.metadata.record.tabs.map((tab) => tab.id)).toEqual([
      'general',
      'contents',
      'system',
    ]);
    expect(tabContentKeys(quickView.metadata.record.tabs[0]?.content)).toContain('principalId');
    expect(tabContentKeys(quickView.metadata.record.tabs[1]?.content)).toEqual([
      'validFrom',
      'validUntil',
      'validityDuration',
      'platformId',
      'applicationId',
      'rules',
    ]);
    const contents = quickView.metadata.record.tabs[1]?.content?.[0];
    expect(contents).toMatchObject({ kind: 'column' });
    expect(tabContentKeys(quickView.metadata.record.tabs[1]?.content)).toContain('validUntil');
    if (contents?.kind === 'column') {
      expect(
        contents.content.find((item) => item.kind === 'field' && item.field === 'validFrom'),
      ).toMatchObject({
        kind: 'field',
        field: 'validFrom',
        label: 'Validity period',
        representation: 'period',
        relatedFields: ['validUntil'],
      });
      expect(
        contents.content.find((item) => item.kind === 'field' && item.field === 'platformId'),
      ).toEqual({ kind: 'field', field: 'platformId' });
      expect(
        contents.content.find((item) => item.kind === 'field' && item.field === 'applicationId'),
      ).toMatchObject({
        kind: 'field',
        field: 'applicationId',
        representation: 'entry-link',
      });
    }
    expect(sysBOLicensesUIMetadata.list?.rowActions?.quickView).toMatchObject({
      kind: 'open-entry',
      placement: 'start',
      iconOnly: true,
      mode: 'view',
      uiView: 'quickView',
    });
  });
});
