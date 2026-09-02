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
    const contract = await sharedSource('src/bo-ui-metadata-types.ts');
    const metadata = await sharedSource('src/bo-ui-metadata.ts');
    const renderer = await uiSource('views/pages/metadata-driven/bo-entry-metadata.ejs');
    const forms = await uiSource('public/js/forms.js');

    expect(contract).toContain('SysBOUITabContentMetadata');
    expect(contract).toContain("kind: 'field'");
    expect(contract).toContain("kind: 'component'");
    expect(contract).toContain("kind: 'break'");
    expect(contract).toContain("kind: 'spacer'");
    expect(contract).toContain('bindings?:');
    expect(metadata).toContain("key: 'contextual-help'");
    expect(metadata).toContain("key: 'provider-credentials'");
    expect(metadata).toContain("key: 'hierarchy-tree'");
    expect(renderer).toContain('metadataComponentPartialFor(String(component.key))');
    expect(renderer).toContain("content.kind === 'break'");
    expect(renderer).toContain('data-metadata-layout-break');
    expect(renderer).toContain("content.kind === 'spacer'");
    expect(renderer).toContain('resolve metadata grid span');
    expect(renderer).toContain('resolveContentSpan(6)');
    expect(renderer).toContain('data-ui-grid-span-ast');
    expect(forms).toContain("kind: 'grid-span'");
    expect(forms).toContain('expressionDependencyPaths(spanAst)');
    expect(renderer).toContain('data-metadata-layout-spacer');
    expect(renderer).toContain('const metadataComponentContext = {');
    expect(renderer).toContain('...metadataComponentContext, component, componentBindings');
    expect(renderer).not.toContain("definition.key === 'sys-ext-auth-providers'");
    expect(renderer).not.toContain("component.key === 'provider-credentials'");
  });

  it('passes canonical renderer context explicitly across EJS include boundaries', async () => {
    const pageRenderer = await uiSource('views/pages/metadata-driven/bo-entry-metadata.ejs');
    const formField = await uiSource('views/pages/metadata-driven/field-components/form-field.ejs');
    const entityField = await uiSource('views/pages/metadata-driven/field-components/entity-field.ejs');

    expect(pageRenderer).toContain('const fieldComponentContext = {');
    expect(pageRenderer).toContain('const metadataComponentContext = {');
    expect(pageRenderer).toContain('...fieldComponentContext, key, span: resolveContentSpan(6)');
    expect(pageRenderer).toContain('...fieldComponentContext, key, span: 6');
    expect(pageRenderer).toContain('...metadataComponentContext, component, componentBindings');
    expect(formField).toContain('dateOnlyValue, datetimeLocalValue, durationParts, durationSerializedValue');
    expect(formField).toContain("include('calculated-field'");
    expect(entityField).toContain("include('text-field'");
    expect(entityField).toContain("include('date-field'");
    expect(entityField).toContain("include('datetime-field'");
    expect(entityField).toContain("include('duration-field'");
    expect(entityField).toContain("include('version-field'");
    expect(entityField).toContain("include('reference-select'");
    expect(entityField).toContain("include('number-field'");
    expect(entityField).toContain("include('boolean-field'");
  });

  it('uses enhanced canonical controls only through the entity-field dispatcher', async () => {
    const renderer = await uiSource('views/pages/metadata-driven/field-components/entity-field.ejs');
    const text = await uiSource('views/pages/metadata-driven/field-components/text-field.ejs');
    const date = await uiSource('views/pages/metadata-driven/field-components/date-field.ejs');
    const datetime = await uiSource('views/pages/metadata-driven/field-components/datetime-field.ejs');
    const duration = await uiSource('views/pages/metadata-driven/field-components/duration-field.ejs');
    const version = await uiSource('views/pages/metadata-driven/field-components/version-field.ejs');
    const enumSelect = await uiSource('views/pages/metadata-driven/field-components/enum-select.ejs');
    const reference = await uiSource('views/pages/metadata-driven/field-components/reference-select.ejs');
    const number = await uiSource('views/pages/metadata-driven/field-components/number-field.ejs');
    const boolean = await uiSource('views/pages/metadata-driven/field-components/boolean-field.ejs');
    const calculated = await uiSource('views/pages/metadata-driven/field-components/calculated-field.ejs');
    const runtime = await uiSource('public/js/field-components/runtime.js');

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
    expect(calculated).toContain('is-readonly');
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
    expect(runtime).not.toContain('manatosCtx');
  });

  it('keeps read-only field tools interactive while disabling only mutating actions', async () => {
    const tools = await uiSource('views/pages/metadata-driven/field-components/field-tools-menu.ejs');
    const calculated = await uiSource('views/pages/metadata-driven/field-components/calculated-field.ejs');
    const enumSelect = await uiSource('views/pages/metadata-driven/field-components/enum-select.ejs');
    const reference = await uiSource('views/pages/metadata-driven/field-components/reference-select.ejs');
    const runtime = await uiSource('public/js/field-components/runtime.js');

    expect(tools).toContain('Copy current value');
    expect(tools).toContain('Inspect in CTX Viewer');
    expect(tools).toContain('showDeveloperTools && inspectCtx');
    expect(tools).toContain(`editable ? '' : 'disabled aria-disabled=\"true\"'`);
    expect(calculated).toContain('data-bs-toggle="dropdown"');
    expect(calculated).not.toContain('disabled\n    aria-disabled="true"');
    expect(enumSelect).toContain('Enumeration field tools');
    expect(enumSelect).toContain('data-enum-choice');
    expect(reference).toContain('referencedEntityIcon');
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
    const renderer = await uiSource('views/pages/metadata-driven/bo-entry-metadata.ejs');
    const enumSelect = await uiSource('views/pages/metadata-driven/field-components/enum-select.ejs');
    expect(renderer).toContain('const contextual = Array.isArray(referenceValues[field.key])');
    expect(renderer).toContain('contextual.map((candidate) => candidate.value)');
    expect(enumSelect).toContain('data-enum-item="<%= JSON.stringify(option) %>"');
  });

  it('uses reusable ui-components for non-field metadata visualizations', async () => {
    const entry = await uiSource('views/pages/metadata-driven/bo-entry-metadata.ejs');
    const list = await uiSource('views/pages/metadata-driven/bo-list-metadata.ejs');
    const uiMetadata = await sharedSource('src/bo-ui-metadata.ts');
    const providerCredentials = await uiSource('views/pages/metadata-driven/ui-components/provider-credentials.ejs');
    const contextualHelp = await uiSource('views/pages/metadata-driven/ui-components/contextual-help.ejs');
    const registry = await uiSource('src/presentation/metadata-component-registry.ts');

    expect(entry).toContain("include('ui-components/debugging-panel'");
    expect(entry).toContain('readOnly: isViewMode || component.readOnly === true');
    expect(entry).toContain("include('ui-components/related-collections'");
    expect(list).toContain("include('ui-components/list-filters'");
    expect(uiMetadata).toContain('notice: {');
    expect(uiMetadata).toContain('disableWhenAllEnumValuesExistForField');
    expect(providerCredentials).toContain("include('../field-components/text-field'");
    expect(providerCredentials).toContain("inputTypeOverride: 'password'");
    expect(providerCredentials).toContain('bindCtx: false');
    expect(contextualHelp).toContain('data-contextual-help-key');
    expect(contextualHelp).toContain('itemsDataKey');
    expect(registry).toContain("'contextual-help': 'ui-components/contextual-help'");
  });

  it('keeps field tool menus compact, content-sized and visually tied to their component button', async () => {
    const tools = await uiSource('views/pages/metadata-driven/field-components/field-tools-menu.ejs');
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
    const formField = await uiSource('views/pages/metadata-driven/field-components/form-field.ejs');
    const forms = await uiSource('public/js/forms.js');
    const css = await uiSource('public/css/pages.css');
    const informationPanel = await uiSource('views/pages/metadata-driven/ui-components/information-panel.ejs');
    const contextualHelp = await uiSource('views/pages/metadata-driven/ui-components/contextual-help.ejs');
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
    expect(registry).toContain("'information-panel': 'ui-components/information-panel'");
  });

});
