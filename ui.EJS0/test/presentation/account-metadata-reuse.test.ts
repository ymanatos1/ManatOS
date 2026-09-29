import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sysBOUsersUIMetadata, tabContentKeys } from '@manatos/shared';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFile(resolve(testDirectory, '..', '..', path), 'utf8');

describe('Account V2 SysUser surface', () => {
  it('opens Account through the canonical metadata-driven SysUser entry renderer', async () => {
    const routes = await source('src/routes/pages/index.ts');
    const renderer = await source('src/routes/sysbo/entry/renderer.ts');

    expect(routes).toContain("getSysBODefinition('sys-users')");
    expect(routes).toContain('resolveUIEntityPermissions(req, definition, user.id)');
    expect(routes).toContain('renderMetadataDrivenRecord(');
    expect(routes).toContain("purpose: 'open-account-entry'");
    expect(routes).toContain("uiViewKey: 'quickView'");
    expect(routes).toContain('showEntryActions: false');
    expect(renderer).not.toContain('entryChromeMuted: surface.showEntryActions === false');
    const pages = await source('public/css/pages.css');
    expect(pages).not.toContain('.entry-chrome-muted');
    expect(routes).not.toContain('forceReadOnly: true');
    expect(routes).not.toContain("renderPage(\n          res,\n          'pages/account'");
  });

  it('keeps Account a distinct self-service surface while reusing canonical entry metadata/runtime', async () => {
    const renderer = await source('src/routes/sysbo/entry/renderer.ts');
    const hostRuntime = await source('public/js/runtime/ui-host-runtime.js');

    expect(renderer).toContain("purpose: surface.purpose ?? 'open-entity-entry'");
    expect(renderer).toContain(
      'surface.forceReadOnly || metadataUI.record.readOnly === true || invocation.mode',
    );
    expect(renderer).toContain('surface.breadcrumbItems ??');
    expect(hostRuntime).toContain("case 'open-account-entry':");
    expect(hostRuntime).toContain("case 'open-entity-entry':");
    const accountView = sysBOUsersUIMetadata.uiViews?.quickView;
    expect(sysBOUsersUIMetadata.defaultUIView).toBe('main');
    expect(accountView?.viewType).toBe('quick');
    expect(accountView?.record?.tabs?.map((tab) => tab.label)).toEqual([
      'General',
      'Authentication',
      'System details',
    ]);
    expect(accountView?.record?.tabs?.[0]?.layout).toBe('details');
    expect(accountView?.record?.tabs?.[0]?.representation).toBe('summary');
    expect(accountView?.record?.readOnly).toBe(true);
    expect(accountView?.record?.tabs?.[0]?.component).toBeUndefined();
    expect(tabContentKeys(accountView?.record?.tabs?.[0]?.content)).toEqual([
      'name',
      'email',
      'role',
      'fullName',
      'firstName',
      'lastName',
      'description',
      'photo',
    ]);
    expect(accountView?.record?.tabs?.[0]?.content?.[0]).toMatchObject({ kind: 'column', span: 6 });
    expect(accountView?.record?.tabs?.[0]?.content?.[1]).toMatchObject({ kind: 'column', span: 6 });
    expect(accountView?.record?.tabs?.[1]?.layout).toBe('details');
    expect(accountView?.record?.tabs?.[1]?.representation).toBe('summary');
    expect(accountView?.record?.tabs?.[1]?.component).toBeUndefined();
    expect(tabContentKeys(accountView?.record?.tabs?.[1]?.content)).toContain(
      'localPasswordStatus',
    );
    expect(tabContentKeys(accountView?.record?.tabs?.[1]?.content)).toContain('externalIdentities');
    expect(accountView?.record?.actionOverrides?.setPassword?.visible).toMatchObject({
      expression: 'id === $user.fields.id.value && hasPassword !== true',
    });
    expect(accountView?.record?.actionOverrides?.changePassword?.visible).toMatchObject({
      expression: 'id === $user.fields.id.value && hasPassword === true',
    });
    expect(accountView?.record?.fieldOverrides?.role?.label).toBe('Website role');
    expect(accountView?.record?.entryActions).toBeUndefined();
  });

  it('makes Account the root active entry level without inventing a SysUsers list caller', async () => {
    const hostRuntime = await source('public/js/runtime/ui-host-runtime.js');
    const renderer = await source('src/routes/sysbo/entry/renderer.ts');
    const bootstrapLayout = await source('src/browser/bootstrap-layout.ts');
    const entryPresentation = await source('src/runtime/v2/entry-presentation.ts');

    const accountCase = hostRuntime.slice(
      hostRuntime.indexOf("case 'open-account-entry':"),
      hostRuntime.indexOf("case 'open-entity-entry':"),
    );
    expect(accountCase).toContain('return bootstrapEntrySurface();');
    expect(accountCase).not.toContain('listSurface(');
    expect(hostRuntime).toContain('const bootstrapEntrySurface = (parent = null) =>');
    expect(hostRuntime).toContain("kind: 'entry'");
    expect(hostRuntime).toContain('...(parent ? { caller: callerReference(parent) } : {})');
    expect(renderer).toContain("surface.purpose === 'open-account-entry'");
    expect(renderer).toContain("? 'ctx.ui.level'");
    expect(renderer).toContain('record.parentOwnerContext');
    expect(renderer).toContain("? 'ctx.ui.level.level.level'");
    expect(renderer).toContain(": 'ctx.ui.level.level'");
    expect(renderer).toContain('levelPath: directHostPath || pageEntryLevelPath');

    expect(bootstrapLayout).toContain('entryPresentationDefinition(uiView');
    expect(entryPresentation).toContain('if (record.tabs.length > 0)');
  });

  it('renders Account authentication through generic details content while retaining the legacy component during migration', async () => {
    const registry = await source('src/presentation/metadata/component-registry.ts');
    const entry = await source('views/components/runtime/entity-entry.ejs');
    const authentication = await source(
      'views/components/sysbo/entry/content/authentication-summary.ejs',
    );
    const authenticationSummary = await source('views/components/auth/authentication-summary.ejs');

    expect(registry).not.toContain('account-profile-summary');
    expect(registry).toContain("'authentication-summary': '../content/authentication-summary'");
    expect(entry).toContain('data-metadata-inline');
    expect(entry).toContain("content.kind === 'collection'");
    expect(entry).toContain('data-v2-entry-action');
    expect(entry).toContain('referenceData: references');
    expect(authentication).toContain(
      'componentData?.collectionResourceData?.externalIdentities?.rows',
    );
    expect(authentication).toContain("include('../../../auth/authentication-summary'");
    expect(authenticationSummary).toContain('data-value-object-entry');
    expect(authentication).toContain('showPasswordAction: options.showPasswordAction === true');
  });

  it('returns password workflow results to the canonical Account surface', async () => {
    const routes = await source('src/routes/pages/index.ts');

    expect(routes).toContain("res.redirect('/account?message=password-saved')");
    expect(routes).toContain("res.redirect('/account?message=password-saved-email-warning')");
    expect(routes).not.toContain("await renderPage(res, 'pages/account'");
  });
});
