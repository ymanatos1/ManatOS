import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const ui = (path: string) => readFile(resolve(here, '..', path), 'utf8');
const shared = (path: string) => readFile(resolve(here, '..', '..', 'shared', path), 'utf8');
const api = (path: string) => readFile(resolve(here, '..', '..', 'api', path), 'utf8');

describe('canonical field type / value-source architecture', () => {
  it('keeps one field renderer path regardless of calculation source', async () => {
    const form = await ui('views/field-components/form-field.ejs');
    const dispatcher = await ui('views/field-components/entity-field.ejs');

    expect(form).toContain("include('entity-field'");
    expect(form).toContain('const calculation = field.calculation');
    expect(form).not.toContain("include('reference-select'");
    expect(form).not.toContain("include('calculated-field'");
    expect(dispatcher).toContain("field.type === 'reference'");
    expect(dispatcher).toContain("field.type === 'enum'");
    expect(dispatcher).not.toContain('calculation');
    expect(dispatcher).not.toContain('persisted');

    await expect(access(resolve(here, '..', 'views/field-components/calculated-field.ejs'))).rejects.toThrow();
  });

  it('defines renderable calculations on canonical typed fields rather than a parallel derivedFields catalogue', async () => {
    const types = await shared('src/metadata/bo/types.ts');
    const identity = await shared('src/metadata/bo/identity.ts');
    const business = await shared('src/metadata/bo/business.ts');
    const contact = await shared('src/metadata/bo/contact.ts');

    expect(types).toContain('calculation?: Readonly<SysBOFieldCalculationMetadata>');
    expect(types).toContain('persisted?: boolean');
    expect(types).toContain('triggeredBy?: readonly string[]');
    for (const source of [types, identity, business, contact]) expect(source).not.toContain('derivedFields');
    expect(identity).toContain("key: 'fullName'");
    expect(identity).toContain("key: 'emailVerificationStatus'");
    expect(identity).toContain("key: 'localPasswordStatus'");
    expect(business).toContain("key: 'rootPrincipalId'");
  });

  it('keeps summary as a higher-level canonical-field container rather than a calculated-field renderer', async () => {
    const tabs = await ui('views/components/sysbo/entry/entry-tab-content.ejs');
    const summary = await ui('views/components/sysbo/entry/summary.ejs');
    expect(tabs).toContain("include('summary'");
    expect(summary).toContain('metadata.fieldDefinition[key]');
    expect(summary).toContain('valueFor(key)');
    expect(summary).not.toContain('derived');
    expect(summary).not.toContain('field.calculation');
  });

  it('keeps calculation scheduling generic and delegates type-specific DOM synchronization to field-components', async () => {
    const formRuntime = await ui('public/js/metadata-form-runtime.js');
    const fieldRuntime = await ui('public/js/field-components/runtime.js');

    expect(formRuntime).toContain("form.querySelectorAll('[data-field-calculation-ast]')");
    expect(formRuntime).toContain('ManatOSFieldComponents?.setFieldValue');
    expect(formRuntime).not.toContain('data-ctx-calculated-field');
    expect(fieldRuntime).toContain('const setFieldValue =');
    expect(fieldRuntime).toContain('const setReferenceValue =');
    expect(fieldRuntime).toContain('const setEnumValue =');
  });

  it('materializes persisted calculations from canonical field metadata at the API boundary', async () => {
    const service = await api('src/services/generic-sysbo-service.ts');
    expect(service).toContain('field.calculation?.persisted === true');
    expect(service).toContain('fieldDefinition.${key}.calculation');
    expect(service).not.toContain('metadata.derivedFields');
  });
});
