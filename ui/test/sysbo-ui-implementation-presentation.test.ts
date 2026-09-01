import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) => readFile(resolve(testDirectory, '..', relativePath), 'utf8');

describe('#16 metadata-driven SysBO UI closure', () => {
  it('uses metadata-driven list/record routes exclusively and removes the temporary engine selector', async () => {
    const routes = await source('src/routes/sysbo-routes.ts');
    const shell = await source('views/layout/shell.ejs');
    const definitions = await source('src/sysbo/definitions.ts');
    const types = await source('src/sysbo/types.ts');
    const configuration = await source('../api/src/services/sys-configuration-service.ts');

    expect(routes).toContain('renderMetadataDrivenList');
    expect(routes).toContain('renderMetadataDrivenRecord');
    expect(routes).not.toContain("router.post('/:key/ui-implementation'");
    expect(routes).not.toContain('CURRENT_SYSBO_UI');
    expect(routes).not.toContain('METADATA_SYSBO_UI');
    expect(routes).not.toContain('persistSysBOUiImplementation');
    expect(shell).not.toContain('sysbo-ui-implementation-selector');
    expect(definitions).not.toContain('listViewModel');
    expect(definitions).not.toContain('editViewModel');
    expect(types).not.toContain('CurrentEJSSysBOUIMetadata');

    // Retired settings may remain named only in the hidden/retired compatibility set.
    expect(configuration).toContain("'UI_SYSBO_EXT_AUTH_PROVIDERS_VIEW_MODE'");
    expect(configuration).not.toMatch(/name:\s*'UI_SYSBO_EXT_AUTH_PROVIDERS_VIEW_MODE'/);
  });

  it('loads canonical BO and UI metadata for every generic list/record page', async () => {
    const routes = await source('src/routes/sysbo-routes.ts');
    const list = await source('views/pages/metadata-driven/bo-list-metadata.ejs');
    const edit = await source('views/pages/metadata-driven/bo-entry-metadata.ejs');
    const related = await source('views/pages/metadata-driven/ui-components/related-collections.ejs');

    expect(routes).toContain('canonicalSysBOMetadata');
    expect(routes).toContain('canonicalSysBOUIMetadata');
    expect(routes).toContain('/$metadata');
    expect(routes).toContain('/$metadata-ui');
    expect(list).toContain('metadataUI.list.visibleFields');
    expect(list).toContain('metadataUI.list.filterFields');
    expect(list).toContain('metadataUI.list.addAction');
    expect(edit).toContain('metadataUI.record.tabs');
    expect(edit).toContain('metadataUI.record.fieldOverrides');
    expect(edit).toContain('tab.content');
    expect(edit).toContain('metadataComponentPartialFor');
    expect(related).toContain("collection.layout === 'table-list'");
    expect(edit).not.toContain("definition.key === 'sys-ext-auth-providers'");
  });

  it('keeps External Authentication Providers entirely declarative after #16 closure', async () => {
    const metadata = await source('../shared/src/bo-ui-metadata.ts');
    const registry = await source('src/presentation/metadata-component-registry.ts');

    expect(metadata).toContain("key: 'sys-ext-auth-providers'");
    expect(metadata).toContain("key: 'contextual-help'");
    expect(metadata).toContain("component: { key: 'provider-credentials', readOnly: false }");
    expect(metadata).toContain('disableWhenAllEnumValuesExistForField');
    expect(metadata).toContain('One configuration record per provider.');
    expect(registry).toContain("'contextual-help': 'ui-components/contextual-help'");
    expect(registry).toContain("'provider-credentials': 'ui-components/provider-credentials'");
  });

  it('keeps framework-neutral UI metadata as the only presentation contract', async () => {
    const contracts = await source('../shared/src/bo-ui-metadata-types.ts');
    const metadata = await source('../shared/src/bo-ui-metadata.ts');

    expect(contracts).toContain('interface SysBOUIMetadata');
    expect(contracts).toContain('interface SysBOUIComponentMetadata');
    expect(contracts).toContain('bindings?:');
    expect(contracts).toContain('relatedCollections');
    expect(contracts).toContain('entryActions');
    expect(metadata).toContain("href: '/bo/sys-applications/{id}/play'");
    expect(metadata).toContain("key: 'date-duration-range'");
  });

  it('uses global runtime paging configuration while metadata selects query fields', async () => {
    const routes = await source('src/routes/sysbo-routes.ts');
    const list = await source('views/pages/metadata-driven/bo-list-metadata.ejs');

    expect(routes).toContain('uiBootstrapState().ui');
    expect(list).toContain('metadataUI.list.filterFields');
    expect(list).toContain('metadataUI.list.sortableFields');
  });
});
