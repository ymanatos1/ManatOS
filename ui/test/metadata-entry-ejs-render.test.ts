import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderFile } from 'ejs';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const tabContentPath = resolve(
  testDirectory,
  '../views/components/sysbo/entry/shell/entry-tab-content.ejs',
);

describe('metadata-driven entry EJS runtime composition', () => {
  it('renders a representative metadata field through extracted tab content', async () => {
    const metadata = {
      fieldDefinition: {
        name: {
          key: 'name',
          label: 'Name',
          type: 'string',
          required: false,
          sensitive: false,
        },
      },
    };
    const ctxFields = { name: { value: 'Example' } };
    const overrides = {};
    const fieldVisible = () => true;
    const fieldEditable = () => true;
    const ctxValue = (key: string) => ctxFields[key as keyof typeof ctxFields]?.value;
    const fieldLabel = (field: { label: string }) => field.label;
    const dynamicUIValue = <T>(value: T) => value;
    const expressionText = () => null;
    const valueFor = (key: string) => ctxValue(key) ?? '';
    const formatValue = (value: unknown) => String(value ?? '');

    const fieldComponentContext = {
      metadata,
      ctxValue,
      referenceLabel: (_fieldKey: string, value: unknown) => String(value ?? ''),
      overrides,
      expressionText,
      compiledEntityMetadata: {},
      compiledUIRecord: {},
      dynamicUIValue,
      ctxFields,
      referenceValues: {},
      fieldVisible,
      fieldEditable,
      valueFor,
      fieldLabel,
      isViewMode: false,
      enumItemsFor: () => [],
      dateOnlyValue: (value: unknown) => String(value ?? ''),
      datetimeLocalValue: (value: unknown) => String(value ?? ''),
      durationParts: () => ({ years: '', months: '', days: '' }),
      durationSerializedValue: () => '',
      formatValue,
    };

    const html = await renderFile(tabContentPath, {
      tabs: [{ id: 'general', label: 'General', order: 1, fields: ['name'] }],
      activeTabId: 'general',
      relatedCollections: {},
      metadata,
      compiledUIRecord: {},
      ctxFields,
      expressionText,
      dynamicUIValue,
      fieldVisible,
      fieldEditable,
      fieldComponentContext,
      metadataComponentContext: {},
      metadataComponentPartialFor: () => null,
      isViewMode: false,
      definition: { key: 'test-entity' },
      recordMode: 'edit',
      entityDebuggingDisplayRows: [],
      uiDebuggingDisplayRows: [],
      debugElementNameParts: () => ({ prefix: '', leaf: '' }),
      csrfToken: 'test-csrf',
      pageRelatedData: {},
      relatedMetadataRegistry: {},
      collectionValue: () => ({ raw: null, tone: null, icon: null, calculated: false }),
      relatedRowHref: () => null,
      relatedReferenceLabel: () => '—',
      optionItemForField: () => null,
      enumToneClass: () => '',
      formatValue,
      overrides,
      ctxValue,
      referenceLabel: (_fieldKey: string, value: unknown) => String(value ?? ''),
      fieldLabel,
      valueFor,
    });

    expect(html).toContain('data-ctx-field="name"');
    expect(html).toContain('value="Example"');
  });
});
