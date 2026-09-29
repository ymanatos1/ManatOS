import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relative: string) =>
  readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

describe('related-list view runtime', () => {
  it('keeps view selection generic, surface-local and CTX-observable', () => {
    const runtime = source('public/js/sysbo/entry/related-list-view-runtime.js');
    const shell = source('views/layout/shell.ejs');
    const users = source('../shared/src/metadata/ui/manatos/auth/ui-users.ts');
    const identities = source('../shared/src/metadata/ui/manatos/auth/ui-external-identities.ts');
    const resources = source('src/routes/sysbo/shared/list-resource.ts');
    const collections = source('src/routes/sysbo/related/collections.ts');

    expect(runtime).toContain("'.state.relatedLists.'");
    expect(runtime).toContain("source: 'related-list-tools'");
    expect(runtime).toContain("'[data-related-list-host]'");
    expect(runtime).not.toContain('localStorage');
    expect(runtime).not.toContain('sys-users');
    expect(runtime).not.toContain('sys-licenses');
    expect(collections).toContain('sysBOEntityListDataSource');
    expect(resources).toContain('export function sysBOEntityListDataSource');
    expect(shell).toContain('/js/sysbo/entry/related-list-view-runtime.js');

    // The User tab requests the collection; the related entity owns its reusable views.
    expect(users).toContain("{ kind: 'collection', collection: 'externalIdentities' }");
    expect(users).toContain("relatedListView: 'default'");
    expect(identities).toContain('relatedListViews: {');
    expect(identities).toContain("label: 'Default'");
    expect(identities).toContain("label: 'Compact'");
  });
});
