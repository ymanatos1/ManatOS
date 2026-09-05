import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const uiSource = (relativePath: string) => readFile(resolve(testDirectory, '..', relativePath), 'utf8');
const apiSource = (relativePath: string) => readFile(resolve(testDirectory, '..', '..', 'api', relativePath), 'utf8');
const sharedSource = (relativePath: string) => readFile(resolve(testDirectory, '..', '..', 'shared', relativePath), 'utf8');

describe('metadata-driven field/content component infrastructure', () => {
  it('composes tab fields and components without entity-specific renderer branches', async () => {
    const contract = await sharedSource('src/metadata/ui/types.ts');
    const metadata = await sharedSource('src/metadata/ui/business.ts');
    const identityMetadata = await sharedSource('src/metadata/ui/identity.ts');
    const renderer = await uiSource('views/pages/sysbo/entry.ejs');
    const tabContent = await uiSource('views/components/sysbo/entry/entry-tab-content.ejs');
    const summary = await uiSource('views/components/sysbo/entry/summary.ejs');
    const runtime = await uiSource('public/js/metadata-form-runtime.js');

    expect(contract).toContain('SysBOUITabContentMetadata');
    expect(contract).toContain("kind: 'field'");
    expect(contract).toContain("kind: 'component'");
    expect(contract).toContain("kind: 'break'");
    expect(contract).toContain("kind: 'spacer'");
    expect(contract).toContain('bindings?:');
    expect(identityMetadata).toContain("key: 'contextual-help'");
    expect(identityMetadata).toContain("key: 'provider-credentials'");
    expect(metadata).toContain("key: 'hierarchy-tree'");
    expect(tabContent).toContain('metadataComponentPartialFor(String(component.key))');
    expect(tabContent).toContain("content.kind === 'break'");
    expect(tabContent).toContain('data-metadata-layout-break');
    expect(tabContent).toContain("content.kind === 'spacer'");
    expect(tabContent).toContain('resolve metadata grid span');
    expect(tabContent).toContain('resolveContentSpan(6)');
    expect(tabContent).toContain('data-ui-grid-span-ast');
    expect(runtime).toContain("kind: 'grid-span'");
    expect(runtime).toContain('expressionDependencyPaths(spanAst)');
    expect(tabContent).toContain('data-metadata-layout-spacer');
    expect(renderer).toContain('const metadataComponentContext = {');
    expect(tabContent).toContain('...metadataComponentContext, component, componentBindings');
    expect(renderer).not.toContain("definition.key === 'sys-ext-auth-providers'");
    expect(renderer).not.toContain("component.key === 'provider-credentials'");
  });

  it('passes canonical renderer context explicitly across EJS include boundaries', async () => {
    const pageRenderer = await uiSource('views/pages/sysbo/entry.ejs');
    const tabContent = await uiSource('views/components/sysbo/entry/entry-tab-content.ejs');
    const summary = await uiSource('views/components/sysbo/entry/summary.ejs');
    const formField = await uiSource('views/field-components/form-field.ejs');
    const entityField = await uiSource('views/field-components/entity-field.ejs');

    expect(pageRenderer).toContain('const fieldComponentContext = {');
    expect(pageRenderer).toContain('const metadataComponentContext = {');
    expect(tabContent).toContain('...fieldComponentContext, key, span: resolveContentSpan(6)');
    expect(tabContent).toContain('...fieldComponentContext, key, span: 6');
    expect(tabContent).toContain('...metadataComponentContext, component, componentBindings');
    expect(formField).toContain('dateOnlyValue, datetimeLocalValue, durationParts, durationSerializedValue');
    expect(formField).toContain("include('entity-field'");
    expect(formField).not.toContain("include('calculated-field'");
    expect(formField).not.toContain("include('reference-select'");
    expect(entityField).toContain("include('text-field'");
    expect(entityField).toContain("include('date-field'");
    expect(entityField).toContain("include('datetime-field'");
    expect(entityField).toContain("include('duration-field'");
    expect(entityField).toContain("include('version-field'");
    expect(entityField).toContain("include('reference-select'");
    expect(entityField).toContain("include('number-field'");
    expect(entityField).toContain("include('boolean-field'");
    expect(formField).toContain('const calculation = field.calculation');
    expect(formField).toContain('data-field-calculation-ast');
    expect(entityField).not.toContain('calculation');
    expect(entityField).not.toContain('derived');
  });

  it('uses enhanced canonical controls only through the entity-field dispatcher', async () => {
    const renderer = await uiSource('views/field-components/entity-field.ejs');
    const text = await uiSource('views/field-components/text-field.ejs');
    const date = await uiSource('views/field-components/date-field.ejs');
    const datetime = await uiSource('views/field-components/datetime-field.ejs');
    const duration = await uiSource('views/field-components/duration-field.ejs');
    const version = await uiSource('views/field-components/version-field.ejs');
    const enumSelect = await uiSource('views/field-components/enum-select.ejs');
    const reference = await uiSource('views/field-components/reference-select.ejs');
    const number = await uiSource('views/field-components/number-field.ejs');
    const boolean = await uiSource('views/field-components/boolean-field.ejs');
    const runtime = await uiSource('public/js/field-components/runtime.js');
    const formRuntimes = (await Promise.all([
      'auth.js',
      'entry-state.js',
      'entry-field-state.js',
      'entry-save.js',
      'entry-focus.js',
      'configuration.js',
      'modal-focus.js',
    ].map((name) => uiSource(`public/js/forms/${name}`)))).join('\n');

    expect(renderer).toContain("field.type === 'string' || field.type === 'email'");
    expect(renderer).toContain("field.type === 'date'");
    expect(renderer).toContain("field.type === 'datetime'");
    expect(renderer).toContain("field.type === 'duration'");
    expect(renderer).toContain("field.type === 'version'");
    expect(renderer).toContain("field.type === 'enum'");
    expect(renderer).toContain("field.type === 'reference'");
    expect(renderer).toContain("field.type === 'number'");
    expect(renderer).toContain("field.type === 'boolean'");
    expect(text).toContain("field.type === 'email' ? 'email' : 'text'");
    expect(date).toContain('data-field-component="date"');
    expect(datetime).toContain('data-field-component="datetime"');
    expect(duration).toContain('data-field-component="duration"');
    expect(version).toContain('data-field-component="version"');
    expect(version).toContain('data-version-canonical-value');
    expect(version).toContain('data-version-part="major"');
    expect(enumSelect).toContain('data-field-component="enum"');
    expect(reference).toContain('data-field-component="reference"');
    expect(number).toContain('data-field-component="number"');
    expect(boolean).toContain('data-field-component="boolean"');
    expect(boolean).toContain('form-switch');
    expect(boolean).not.toContain('metadata-field-input-menu');
    expect(boolean).not.toContain("include('field-tools-menu'");
    expect(text).toContain('>Tt</span>');
    expect(text).toContain("effectiveEditable ? 'is-enabled' : 'is-readonly'");
    expect(text).toContain('data-field-control');
    expect(runtime).toContain("case 'toggle'");
    expect(runtime).toContain("case 'zero'");
    expect(runtime).toContain('[data-version-part]');
    expect(runtime).toContain("const event = new Event(type, { bubbles: true })");
    expect(runtime).toContain("dispatch('input')");
    expect(runtime).toContain("dispatch('change')");
    expect(runtime).toContain("'manatosCause'");
    expect(runtime).toContain("control.getAttribute?.('aria-hidden') !== 'true'");
    expect(runtime).toContain("!control.classList?.contains('visually-hidden')");
    expect(runtime).toContain("const enumChoice = target.closest('[data-enum-choice]')");
    expect(runtime).toContain("setEnumValue(control, enumChoice.dataset.enumChoice || '')");
    expect(runtime).toContain("document.querySelectorAll('[data-metadata-enum-select] select[data-enum-items]')");
    expect(runtime).toContain("if (control.closest('[data-metadata-reference-select]'))");
    expect(formRuntimes).not.toContain('Metadata-driven rich enum component');
    expect(formRuntimes).not.toContain("document.querySelectorAll('[data-metadata-enum-select]')");
    expect(formRuntimes).not.toContain("data-enum-selected-label");
    expect(runtime).not.toContain('manatosCtx');
  });

  it('keeps read-only field tools interactive while disabling only mutating actions', async () => {
    const tools = await uiSource('views/field-components/field-tools-menu.ejs');
    const enumSelect = await uiSource('views/field-components/enum-select.ejs');
    const reference = await uiSource('views/field-components/reference-select.ejs');
    const runtime = await uiSource('public/js/field-components/runtime.js');

    expect(tools).toContain('Copy current value');
    expect(tools).toContain('Inspect in CTX Viewer');
    expect(tools).toContain('showDeveloperTools && inspectCtx');
    expect(tools).toContain(`editable ? '' : 'disabled aria-disabled=\"true\"'`);
    expect(enumSelect).toContain('Enumeration field tools');
    expect(enumSelect).toContain('data-enum-choice');
    expect(reference).toContain('__entryIcons');
    expect(reference).toContain('metadata-entry-icons');
    expect(reference).not.toContain('data-ctx-calculated-field');
    expect(reference).toContain('data-reference-choice');
    expect(runtime).toContain("case 'copy'");
    expect(runtime).toContain("case 'inspect-ctx'");
    expect(runtime).toContain('manatos:ctx-viewer-show');
    expect(runtime).toContain('manatos:ctx-viewer-select');
  });

  it('keeps date/time controls compact while allowing datetime more room', async () => {
    const pages = await uiSource('public/css/pages.css');
    expect(pages).toContain("data-field-component='date'");
    expect(pages).toContain("max-width: 19rem");
    expect(pages).toContain("data-field-component='time'");
    expect(pages).toContain("max-width: 14rem");
    expect(pages).toContain("data-field-component='datetime'");
    expect(pages).toContain("max-width: 28rem");
    expect(pages).toContain("data-field-component='duration'");
    expect(pages).toContain("max-width: 32rem");
  });

  it('keeps numeric controls compact while text/password controls remain fluid', async () => {
    const pages = await uiSource('public/css/pages.css');
    expect(pages).toContain("data-field-component='number'");
    expect(pages).toContain('max-width: 9rem');
    expect(pages).toContain("data-field-component='version'");
    expect(pages).toContain('max-width: 20rem');
    expect(pages).toContain('.metadata-version-editor {');
    expect(pages).toContain('padding: 0');
    expect(pages).toContain('.metadata-field-input > .password-visibility-field');
    expect(pages).toContain('flex: 1 1 auto');
    expect(pages).not.toContain("data-field-component='text'] {\n  width: min(");
  });

  it('lets contextual enum options narrow and enrich the canonical enum catalogue', async () => {
    const renderer = await uiSource('views/pages/sysbo/entry.ejs');
    const enumSelect = await uiSource('views/field-components/enum-select.ejs');
    expect(renderer).toContain('const contextual = Array.isArray(referenceValues[field.key])');
    expect(renderer).toContain('contextual.map((candidate) => candidate.value)');
    expect(enumSelect).toContain('data-enum-item="<%= JSON.stringify(option) %>"');
    expect(enumSelect).toContain('const canonicalEnumItems = Array.isArray(field.enumItems)');
    expect(enumSelect).toContain('Array.isArray(field.optionItems) ? field.optionItems : []');
    expect(enumSelect).toContain('const presentationItems = enumItems.map((option) => ({');
    expect(enumSelect).toContain("String(candidate?.value ?? '') === String(option?.value ?? '')");
    expect(enumSelect).toContain('data-enum-selected-icon');
  });

  it('centralizes enum and reference icon+label presentation in their universal field components', async () => {
    const identity = await sharedSource('src/metadata/bo/identity.ts');
    const business = await sharedSource('src/metadata/bo/business.ts');
    const entityField = await uiSource('views/field-components/entity-field.ejs');
    const formField = await uiSource('views/field-components/form-field.ejs');
    const enumSelect = await uiSource('views/field-components/enum-select.ejs');
    const referenceSelect = await uiSource('views/field-components/reference-select.ejs');

    expect(identity).toContain("{ value: SysBOUserRole.Admin, label: 'Admin', icon: 'shield-lock-fill' }");
    expect(identity).toContain("{ value: SysBOUserRole.Superuser, label: 'Superuser', icon: 'shield-check' }");
    expect(identity).toContain("{ value: SysBOUserRole.User, label: 'User', icon: 'person-fill' }");
    expect(identity).toContain("{ value: SysBOUserRole.Guest, label: 'Guest', icon: 'person' }");
    expect(business).toContain("...(platform.icon ? { icon: platform.icon.replace(/^bi-/, '') } : {})");

    // Ordinary fields dispatch to exactly one generic enum/reference component.
    expect(entityField.match(/include\('enum-select'/g)?.length).toBe(1);
    expect(entityField.match(/include\('reference-select'/g)?.length).toBe(1);
    // Value-source semantics never bypass the canonical type dispatcher.
    expect(formField).toContain("include('entity-field'");
    expect(formField).not.toContain("include('reference-select'");

    expect(enumSelect).toContain('data-enum-selected-icon');
    expect(enumSelect).toContain('d-flex align-items-center gap-2');
    expect(enumSelect).toContain("richSelected?.icon ? `bi-${richSelected.icon}` : 'd-none'");
    expect(enumSelect).toContain('<i class="bi bi-<%= option.icon %>');
    expect(referenceSelect).toContain('reference?.__entryIcons');
    expect(referenceSelect).toContain('metadata-entry-icons me-1');
  });

  it('uses reusable ui-components for non-field metadata visualizations', async () => {
    const entry = await uiSource('views/pages/sysbo/entry.ejs');
    const list = await uiSource('views/pages/sysbo/list.ejs');
    const uiMetadata = await sharedSource('src/metadata/ui/identity.ts');
    const providerCredentials = await uiSource('views/components/sysbo/entry/provider-credentials.ejs');
    const contextualHelp = await uiSource('views/components/common/contextual-help.ejs');
    const registry = await uiSource('src/presentation/metadata-component-registry.ts');

    const tabContent = await uiSource('views/components/sysbo/entry/entry-tab-content.ejs');
    const summary = await uiSource('views/components/sysbo/entry/summary.ejs');
    expect(tabContent).toContain("include('../../debugging/debugging-panel'");
    expect(tabContent).toContain('readOnly: isViewMode || component.readOnly === true');
    expect(tabContent).toContain("include('summary'");
    expect(summary).toContain("include('../collections/related-collections'");
    expect(list).toContain("include('../../components/sysbo/list/list-filters'");
    expect(uiMetadata).toContain('notice: {');
    expect(uiMetadata).toContain('disableWhenAllEnumValuesExistForField');
    const workflowInput = await uiSource('views/components/common/workflow-input.ejs');
    const recordQuick = await uiSource('views/components/sysbo/hierarchy/record-quick.ejs');
    expect(providerCredentials).toContain("include('../../../field-components/entity-field'");
    expect(providerCredentials).toContain("include('../../common/workflow-input'");
    expect(providerCredentials).not.toContain("include('../../../field-components/text-field'");
    expect(providerCredentials).toContain('bindCtx: false');
    expect(workflowInput).toContain('data-workflow-input');
    expect(workflowInput).not.toContain('data-ctx-field');
    expect(workflowInput).not.toContain('field-tools-menu');
    expect(recordQuick).toContain("include('../../../field-components/entity-field'");
    expect(recordQuick).toContain('bindCtx: false');
    expect(contextualHelp).toContain('data-contextual-help-key');
    expect(contextualHelp).toContain('itemsDataKey');
    expect(registry).toContain("'contextual-help': '../../common/contextual-help'");
    expect(tabContent).toContain("include(componentPartial");
  });

  it('keeps field tool menus compact, content-sized and visually tied to their component button', async () => {
    const tools = await uiSource('views/field-components/field-tools-menu.ejs');
    const css = await uiSource('public/css/pages.css');
    const theme = await uiSource('public/css/theme.css');
    expect(tools).toContain("metadata-field-input-menu <%= editable ? 'is-enabled' : 'is-readonly' %>");
    expect(css).toContain('.metadata-field-input-menu {');
    expect(css).toContain('width: max-content');
    expect(css).toContain('min-width: 13.5rem');
    expect(css).toContain('max-width: calc(100vw - 2rem)');
    expect(css).toContain('.metadata-field-input-menu.is-enabled');
    expect(css).toContain('--bs-dropdown-bg: var(--manatos-current-field-tool-bg');
    expect(css).toContain("[data-field-component='text']");
    expect(css).toContain("[data-field-component='email']");
    expect(css).toContain("[data-field-component='enum']");
    expect(css).toContain("[data-field-component='reference']");
    expect(css).toContain("[data-field-component='date']");
    expect(css).toContain("[data-field-component='datetime']");
    expect(css).toContain("[data-field-component='duration']");
    expect(css).toContain("[data-field-component='number']");
    expect(css).toContain("[data-field-component='boolean']");
    expect(css).toContain('.metadata-field-input-menu.is-readonly');
    expect(css).toContain('.metadata-field-input.is-tools-open');
    expect(css).not.toContain('.metadata-field-input-menu {\n  width: 100%');
    expect(theme).toContain('--manatos-field-tool-text-bg: #f1fbff');
    expect(theme).toContain('--manatos-field-tool-readonly-bg');
    expect(theme).toContain("html[data-ui-theme='lighter']");
    expect(theme).toContain("html[data-ui-theme='darker']");
  });

  it('uses universal field labels and reversible CTX-driven change decoration', async () => {
    const formField = await uiSource('views/field-components/form-field.ejs');
    const forms = await uiSource('public/js/forms/entry-field-state.js');
    const css = await uiSource('public/css/pages.css');
    const informationPanel = await uiSource('views/components/common/information-panel.ejs');
    const contextualHelp = await uiSource('views/components/common/contextual-help.ejs');
    const registry = await uiSource('src/presentation/metadata-component-registry.ts');

    expect(formField).toContain('data-metadata-field-label="<%= key %>"');
    expect(formField).toContain(':<% if (field.required) { %><span class="metadata-field-required-marker"');
    expect(forms).toContain('Metadata-driven per-field change highlighting');
    expect(forms).toContain("window.addEventListener('manatos:ctx-change', schedule)");
    expect(forms).toContain("container.classList.toggle('metadata-field-changed', changed)");
    expect(css).toContain('.metadata-field-changed');
    expect(css).toContain('font-weight: 700');
    expect(informationPanel).toContain('data-information-panel');
    expect(informationPanel).toContain('data-bs-toggle="collapse"');
    expect(contextualHelp).toContain("include('information-panel'");
    expect(registry).toContain("'information-panel': '../../common/information-panel'");
  });


  it('keeps enum option extraction inside the canonical field-component runtime', async () => {
    const runtime = await uiSource('public/js/metadata-form-runtime.js');
    const fieldRuntime = await uiSource('public/js/field-components/runtime.js');

    expect(runtime).toContain('window.ManatOSFieldComponents?.getFieldOption?.(control)');
    expect(runtime).not.toContain('selectedEnumItem');
    expect(runtime).not.toContain('dataset.enumItems');
    expect(runtime).not.toContain('dataset.enumItem');
    expect(fieldRuntime).toContain('const getFieldOption = (control) =>');
    expect(fieldRuntime).toContain("root?.dataset.fieldComponent !== 'enum'");
    expect(fieldRuntime).toContain('selectedOption?.dataset?.enumItem');
    expect(fieldRuntime).toContain('getFieldOption,');
  });

  it('renders null calculated references as None on initial and live updates', async () => {
    const entry = await readFile(resolve(testDirectory, '../views/pages/sysbo/entry.ejs'), 'utf8');
    const runtime = await readFile(resolve(testDirectory, '../public/js/metadata-form-runtime.js'), 'utf8');
    const fieldRuntime = await readFile(resolve(testDirectory, '../public/js/field-components/runtime.js'), 'utf8');

    expect(entry).toContain("if (value === undefined || value === null || value === '') return 'None'");
    expect(runtime).toContain('window.ManatOSFieldComponents?.setFieldValue');
    expect(fieldRuntime).toContain("control.required ? 'Choose...' : 'None'");
    expect(fieldRuntime).toContain("if (component === 'reference') setReferenceValue(control, value)");
    expect(fieldRuntime).toContain('const renderReferenceSelection = (selected, control) =>');
    expect(fieldRuntime).toContain("option?.dataset.entryName");
    expect(fieldRuntime).toContain("JSON.parse(option.dataset.entryIcons || '[]')");
    expect(fieldRuntime).not.toContain("selected.textContent = control.value");
    expect(runtime).not.toContain("element.dataset.calculatedFieldType === 'reference'");
  });

});
