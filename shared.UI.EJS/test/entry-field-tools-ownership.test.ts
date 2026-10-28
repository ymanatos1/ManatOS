import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const fieldTypes = [
  'Boolean',
  'Date',
  'Datetime',
  'Duration',
  'Email',
  'Enum',
  'Guid',
  'Number',
  'Picture',
  'Pictures',
  'Reference',
  'RichText',
  'Telephone',
  'Text',
  'Version',
] as const;

describe('EJS1 concrete Field Tools ownership', () => {
  it('declares a Field-owned Tools child in all 15 concrete templates', () => {
    for (const type of fieldTypes) {
      const html = readFileSync(
        new URL(`../src/components/entry/fields/types/${type}Field.html`, import.meta.url),
        'utf8',
      );
      expect(html.match(/data-entry-field-tools-slot/g)).toHaveLength(1);
    }
  });

  it('does not insert Tools from FormField, which owns only the label and typed slot', () => {
    const html = readFileSync(
      new URL('../src/components/entry/templates/FormField.html', import.meta.url),
      'utf8',
    );
    expect(html).toContain('data-entry-typed-field');
    expect(html).not.toContain('UIS:Tools');
    expect(html).not.toContain('manatos-field-tools');
  });
});
