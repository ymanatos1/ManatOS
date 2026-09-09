import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('V2 License rich-entry acceptance', () => {
  it('keeps License composition declarative while accepted generic V2 entry infrastructure owns state', () => {
    const businessUi = source('../../../shared/src/metadata/ui/business.ts');
    const businessMetadata = source('../../../shared/src/metadata/bo/business.ts');
    const renderer = source('../../src/routes/sysbo/record-renderer.ts');
    const rangeComponent = source(
      '../../views/components/sysbo/entry/content/date-duration-range.ejs',
    );

    expect(businessUi).toContain(
      `platformId: { createDefaultValue: { expression: "FirstCtx(platformId.options, 'value')" } }`,
    );
    expect(businessUi).toContain(
      `validFrom: { createDefaultValue: { expression: 'CurrentDay()' } }`,
    );
    expect(businessUi).toContain("status: { createDefaultValue: 'Active' }");
    expect(businessUi).toContain("key: 'date-duration-range'");

    expect(businessMetadata).toContain(
      'validFrom == null || validityDuration == null ? null : CalendarAddDuration(validFrom, validityDuration)',
    );
    expect(businessMetadata).toContain(
      'validFrom == null || validUntil == null ? null : CalendarDurationBetween(validFrom, validUntil)',
    );
    expect(rangeComponent).not.toContain('CalendarAddDuration');
    expect(rangeComponent).not.toContain('CalendarDurationBetween');

    expect(renderer).not.toContain("definition.key === 'sys-licenses'");
    expect(renderer).not.toContain("definition.key === 'sys-license'");
  });
});
