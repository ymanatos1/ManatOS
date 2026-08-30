import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));

async function source(relativePath: string): Promise<string> {
  return readFile(resolve(testDirectory, '..', relativePath), 'utf8');
}

describe('#16 SysBO UI implementation migration scaffolding', () => {
  it('keeps current EJS as the default and persists each SysBO selection through SysConfiguration', async () => {
    const routes = await source('src/routes/sysbo-routes.ts');
    expect(routes).toContain("const CURRENT_SYSBO_UI: SysBOUiImplementation = 'current'");
    expect(routes).toContain("const METADATA_SYSBO_UI: SysBOUiImplementation = 'metadata'");
    expect(routes).toContain("router.post('/:key/ui-implementation'");
    expect(routes).toContain('UI_SYSBO_USERS_VIEW_MODE');
    expect(routes).toContain('persistSysBOUiImplementation');
    expect(routes).toContain('MetadataDriven');
    expect(routes).toContain("definition.key !== 'sys-configurations'");
    const sessionTypes = await source('src/types/express.d.ts');
    expect(sessionTypes).not.toContain('sysBOUiImplementations');
  });

  it('renders the temporary selector above the shared SysBO title panel', async () => {
    const shell = await source('views/layout/shell.ejs');
    const list = await source('views/pages/bo-list.ejs');
    const edit = await source('views/pages/bo-edit.ejs');
    const selector = await source('views/partials/metadata-driven/sysbo-ui-implementation-selector.ejs');

    expect(shell).toContain("include('../partials/metadata-driven/sysbo-ui-implementation-selector')");
    expect(shell.indexOf("include('../partials/metadata-driven/sysbo-ui-implementation-selector')")).toBeLessThan(
      shell.indexOf('<div class=\"workspace-titlebar\">'),
    );
    expect(list).not.toContain("include('../partials/metadata-driven/sysbo-ui-implementation-selector')");
    expect(edit).not.toContain("include('../partials/metadata-driven/sysbo-ui-implementation-selector')");
    expect(selector).toContain('#16 UI engine');
    expect(selector).toContain('Current EJS');
    expect(selector).toContain('Metadata-driven');
    expect(selector).toContain('role="switch"');
    expect(selector).toContain('sysbo-ui-engine-toggle');
    expect(selector).toContain('is-selected');
    expect(selector).toContain('is-unselected');
  });

  it('loads both canonical BO and UI metadata for metadata-driven list/record pages', async () => {
    const routes = await source('src/routes/sysbo-routes.ts');
    const list = await source('views/pages/metadata-driven/bo-list-metadata.ejs');
    const edit = await source('views/pages/metadata-driven/bo-entry-metadata.ejs');

    expect(routes).toContain('canonicalSysBOMetadata');
    expect(routes).toContain('canonicalSysBOUIMetadata');
    expect(routes).toContain('/$metadata');
    expect(routes).toContain('/$metadata-ui');
    expect(routes).toContain('title: metadata.pluralName');
    expect(routes).toContain('`${modeLabel} ${metadata.name}${primaryDisplayValue}`');

    expect(list).toContain('metadataUI.list.visibleFields');
    expect(list).toContain('metadataUI.list.filterFields');
    expect(list).toContain('metadataUI.list.sortableFields');
    expect(list).toContain('metadataUI.list.addAction');
    expect(list).toContain('data-page-size-select');
    expect(list).toContain('Page <%= paging.page %> of <%= paging.totalPages %>');

    expect(edit).toContain('metadataUI.record.tabs');
    expect(edit).toContain('metadataUI.record.fieldOverrides');
    expect(edit).toContain('tab.fields');
    expect(edit).toContain('tab.icon');
    expect(edit).toContain('derivedFields');
    expect(edit).toContain('createDefaultValue');
    expect(edit).toContain('entryActions');
    expect(edit).toContain('relatedCollections');
    expect(edit).toContain('activeTabId');
  });

  it('defines framework-neutral $metadata-ui entries for every SysBO participating in #16', async () => {
    const shared = await source('../shared/src/bo-ui-metadata.ts');
    const canonicalMetadata = await source('../shared/src/bo-metadata.ts');
    const apiMetadata = await source('../api/src/metadata/sysbo-ui-definitions.ts');
    const apiRegistry = await source('../api/src/metadata/sysbo-ui-registry.ts');
    const apiRouter = await source('../api/src/http/sysbo-router.ts');

    expect(shared).toContain('interface SysBOUIMetadata');
    expect(shared).toContain('visibleFields');
    expect(shared).toContain('filterFields');
    expect(shared).toContain('sortableFields');
    expect(shared).toContain('addAction');
    expect(shared).toContain('tabs');
    expect(shared).toContain('fieldOverrides');
    expect(shared).toContain('derivedFields');
    expect(shared).toContain('createDefaultValue');
    expect(shared).toContain('entryActions');
    expect(shared).toContain('relatedCollections');
    expect(apiMetadata).toContain("icon: 'shield-lock'");
    expect(apiMetadata).toContain(
      "mode !== 'create' && (user.permissions.userRole === 'Admin' || id === user.fields.id.value)",
    );

    // Entity-level derived values such as emailVerificationStatus and
    // localPasswordStatus stay canonical. UI metadata dynamically evaluates
    // only presentation decisions such as tone/icon.
    expect(apiMetadata).toContain("editable: { expression: \"user.permissions.userRole === 'Admin'\" }");
    expect(apiMetadata).toContain('emailVerificationStatus');
    expect(apiMetadata).toContain("tone: { expression: \"emailVerified ? 'success' : 'secondary'\" }");
    expect(apiMetadata).toContain('localPasswordStatus');
    expect(apiMetadata).toContain("icon: { expression: \"hasPassword ? 'check-circle-fill' : 'dash-circle'\" }");

    // External Identity now has its own canonical value-object metadata. The
    // related collection names that entity and keeps only presentation choices.
    expect(canonicalMetadata).toContain('sysBOExternalIdentityMetadata');
    expect(canonicalMetadata).toContain("key: 'external-identities'");
    expect(canonicalMetadata).toContain('providerEmailVerificationStatus');
    expect(canonicalMetadata).toContain("expression: \"emailVerified ? 'Provider email verified' : 'Provider email not verified'\"");
    expect(apiMetadata).toContain("entityKey: 'external-identities'");
    expect(apiMetadata).toContain('externalIdentities: {');
    expect(apiMetadata).toContain('fields: {');
    expect(apiMetadata).toContain('providerEmailVerificationStatus: {');

    // Keyed metadata containers do not repeat their parent key in each value.
    expect(apiMetadata).toContain('entryActions: {');
    expect(apiMetadata).toContain('delete: {');
    expect(apiMetadata).toContain("kind: 'delete'");
    expect(apiMetadata).not.toContain("key: 'externalIdentities'");
    expect(apiMetadata).not.toContain("sourceKey: 'externalIdentities'");
    expect(apiMetadata).not.toContain("sourceField: 'provider'");
    expect(apiMetadata).not.toContain("sourceField: 'email'");

    for (const definitionName of [
      'sysBOUsersUIMetadata',
      'sysBOPrincipalsUIMetadata',
      'sysBOApplicationsUIMetadata',
      'sysBOLicensesUIMetadata',
      'sysBOExtAuthProvidersUIMetadata',
    ]) {
      expect(apiRegistry).toContain(definitionName);
    }

    expect(apiRouter).toContain("router.get('/$metadata-ui'");
    expect(apiRouter).toContain('includeMetadataUI');
    expect(apiRouter).toContain('getEffectiveSysBOUIMetadata(metadata)');
    expect(apiMetadata).not.toContain('.ejs');
    expect(apiRegistry).not.toContain('.ejs');
  });

  it('uses the global runtime paging configuration while UI metadata drives query fields', async () => {
    const routes = await source('src/routes/sysbo-routes.ts');

    expect(routes).toContain('metadataDrivenListQuery');
    expect(routes).toContain('uiBootstrapState().ui');
    expect(routes).toContain('metadataUI.list.sortableFields.includes');
    expect(routes).toContain('metadataUI.list.filterFields');
  });
});
