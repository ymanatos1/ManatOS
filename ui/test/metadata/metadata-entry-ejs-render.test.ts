import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile, renderFile } from 'ejs';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const tabContentPath = resolve(
  testDirectory,
  '../../views/components/sysbo/entry/shell/entry-tab-content.ejs',
);
const metadataComponentPath = resolve(
  testDirectory,
  '../../views/components/sysbo/entry/shell/metadata-component.ejs',
);

describe('metadata-driven entry EJS runtime composition', () => {
  it('compiles the canonical V2 entity-entry template', async () => {
    const source = await import('node:fs/promises').then(({ readFile }) =>
      readFile(resolve(testDirectory, '../../views/components/runtime/entity-entry.ejs'), 'utf8'),
    );

    expect(() => compile(source)).not.toThrow();
  });

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
      tabs: [
        { id: 'general', label: 'General', order: 1, content: [{ kind: 'field', field: 'name' }] },
      ],
      activeTabId: 'general',
      relatedCollections: {},
      metadata,
      compiledUIRecord: {},
      ctxFields,
      expressionText,
      dynamicUIValue,
      fieldVisible,
      fieldEditable,
      fieldRepresentationFor: (representation: string) => representation,
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
      pageCollectionResourceData: {},
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
      referenceValues: {},
      fieldLabel,
      valueFor,
    });

    expect(html).toContain('data-ctx-field="name"');
    expect(html).toContain('value="Example"');
  });

  it('renders a collection-bearing metadata component with canonical related entity metadata', async () => {
    const html = await renderFile(metadataComponentPath, {
      component: {
        key: 'collection-editor',
        options: {
          sourceKey: 'emailAddresses',
          itemEntityKey: 'sysEmailAddresses',
          label: 'Email addresses',
          fieldOverrides: [{ key: 'value', label: 'Duplicated UI label', inputSpan: 12 }],
        },
      },
      componentBindings: {},
      componentBindingExpressions: {},
      componentOptions: {},
      componentPartial: '../content/collection-editor',
      metadataComponentContext: {
        componentData: {
          collectionResourceData: { emailAddresses: { rows: [] } },
        },
        relatedMetadataRegistry: {
          sysEmailAddresses: {
            fieldDefinition: {
              value: {
                key: 'value',
                label: 'Email address',
                type: 'email',
                required: true,
                maxLength: 320,
              },
            },
          },
        },
        isViewMode: false,
      },
      definition: { key: 'sys-principals' },
      recordMode: 'edit',
      readOnly: false,
      span: 12,
      spanExpression: null,
      ctxScopePath: 'ctx.ui.level',
    });

    expect(html).toContain('data-metadata-component="collection-editor"');
    expect(html).toContain('Email address:');
    expect(html).toContain('maxlength="320"');
  });

  it('renders a summary tab with the explicit reference-selector contract', async () => {
    const metadata = {
      fieldDefinition: {
        principalId: {
          key: 'principalId',
          label: 'Principal',
          type: 'reference',
          sensitive: false,
        },
      },
    };
    const referenceValues = {
      principalId: [
        {
          id: 'principal-1',
          name: 'Example Person',
          value: 'principal-1',
          label: 'Example Person',
        },
      ],
    };
    const fieldVisible = () => true;
    const fieldEditable = () => true;
    const fieldLabel = (field: { label: string }) => field.label;
    const dynamicUIValue = <T>(value: T) => value;
    const valueFor = () => 'principal-1';
    const formatValue = (value: unknown) => String(value ?? '');

    const html = await renderFile(tabContentPath, {
      tabs: [
        {
          id: 'summary',
          label: 'Summary',
          order: 1,
          content: [{ kind: 'column', content: [{ kind: 'field', field: 'principalId' }] }],
          layout: 'summary',
        },
      ],
      activeTabId: 'summary',
      relatedCollections: {},
      metadata,
      compiledUIRecord: {},
      ctxFields: {},
      expressionText: () => null,
      dynamicUIValue,
      fieldVisible,
      fieldEditable,
      fieldRepresentationFor: (representation: string) => representation,
      fieldComponentContext: {},
      metadataComponentContext: {},
      metadataComponentPartialFor: () => null,
      isViewMode: false,
      definition: { key: 'test-entity' },
      recordMode: 'edit',
      entityDebuggingDisplayRows: [],
      uiDebuggingDisplayRows: [],
      debugElementNameParts: () => ({ prefix: '', leaf: '' }),
      csrfToken: 'test-csrf',
      pageCollectionResourceData: {},
      relatedMetadataRegistry: {},
      collectionValue: () => ({ raw: null, tone: null, icon: null, calculated: false }),
      relatedRowHref: () => null,
      relatedReferenceLabel: () => '—',
      optionItemForField: () => null,
      enumToneClass: () => '',
      formatValue,
      overrides: {},
      ctxValue: () => null,
      referenceLabel: () => 'Example Person',
      referenceValues,
      fieldLabel,
      valueFor,
    });

    expect(html).toContain('name="principalId"');
    expect(html).toContain('Example Person');
  });
});
