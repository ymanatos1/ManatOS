import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const uiSource = (path: string) => readFile(resolve(testDirectory, '..', path), 'utf8');
const apiSource = (path: string) => readFile(resolve(testDirectory, '..', '..', 'api', path), 'utf8');
const sharedSource = (path: string) => readFile(resolve(testDirectory, '..', '..', 'shared', path), 'utf8');

describe('generic date-duration-range component', () => {
  it('is layout-only while canonical field calculations are CTX/evaluator driven', async () => {
    const component = await uiSource('views/pages/metadata-driven/ui-components/date-duration-range.ejs');
    const fieldRenderer = await uiSource('views/pages/metadata-driven/field-components/form-field.ejs');
    const forms = await uiSource('public/js/forms.js');
    const uiMetadata = await sharedSource('src/bo-ui-metadata.ts');
    const canonicalMetadata = await sharedSource('src/bo-metadata.ts');
    const uiContract = await sharedSource('src/bo-ui-metadata-types.ts');
    const shell = await uiSource('views/layout/shell.ejs');

    expect(component).toContain("include('../field-components/form-field'");
    expect(component).toContain('metadata-date-duration-range-primary');
    expect(component).toContain('metadata-date-duration-range-end');
    expect(component).toContain('key: startField, span: 6');
    expect(component).toContain('key: durationField, span: 6');
    expect(component).toContain('key: endField, span: 6');
    expect(component.indexOf('key: startField')).toBeLessThan(component.indexOf('key: durationField'));
    expect(component.indexOf('key: durationField')).toBeLessThan(component.indexOf('metadata-date-duration-range-end'));
    expect(component).not.toContain('triggeredBy');
    expect(component).not.toContain('CalendarAddDuration');
    expect(component).not.toContain('CalendarDurationBetween');

    expect(canonicalMetadata).toContain("expression: 'CalendarAddDuration(validFrom, validityDuration)'");
    expect(canonicalMetadata).toContain("expression: 'CalendarDurationBetween(validFrom, validUntil)'");
    expect(canonicalMetadata).toContain("triggeredBy: ['validFrom', 'validityDuration']");
    expect(canonicalMetadata).toContain("triggeredBy: ['validUntil']");
    expect(fieldRenderer).toContain('data-field-calculation-ast');
    expect(fieldRenderer).toContain('data-field-calculation-triggered-by');
    expect(forms).toContain("kind: 'field-calculation'");
    expect(forms).toContain('change.cause?.triggerPath');
    expect(forms).toContain('rootEventId');
    expect(forms).not.toContain('WeakSet');

    expect(uiMetadata).toContain("key: 'date-duration-range'");
    expect(uiMetadata).not.toContain('component: {\n                key: \'date-duration-range\',\n                readOnly: false,\n                options: {\n                  startField: \'validFrom\',\n                  durationField: \'validityDuration\',\n                  endField: \'validUntil\',\n                },\n                calculations:');
    expect(uiContract).not.toContain('SysBOUIComponentCalculationMetadata');
    expect(shell).not.toContain('/js/components/date-duration-range.js');
  });

  it('exposes canonical field calculations generically in the Debugging tab with CTX tools', async () => {
    const renderer = await uiSource('views/pages/metadata-driven/bo-entry-metadata.ejs');
    const panel = await uiSource('views/pages/metadata-driven/ui-components/debugging-panel.ejs');
    const forms = await uiSource('public/js/forms.js');

    expect(renderer).toContain('FIELD CALCULATIONS');
    expect(renderer).toContain('fieldMetadata?.calculation');
    expect(renderer).not.toContain('COMPONENT CALCULATIONS');
    expect(renderer).not.toContain('component.calculations');
    expect(panel).toContain('data-debug-inspect-ctx');
    expect(panel).toContain('Inspect formula in CTX Viewer');
    expect(panel).toContain('Inspect current value in CTX Viewer');
    expect(forms).toContain('data-debug-inspect-ctx');
    expect(forms).toContain('manatos:ctx-viewer-show');
    expect(forms).toContain('expand: true');
  });
});
