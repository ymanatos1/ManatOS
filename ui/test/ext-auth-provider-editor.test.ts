import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (path: string) => readFile(resolve(testDirectory, '..', path), 'utf8');

describe('external authentication provider metadata-driven editor', () => {
  it('declares provider General help and Secrets through reusable metadata components', async () => {
    const metadata = await source('../shared/src/bo-ui-metadata.ts');
    expect(metadata).toContain("key: 'contextual-help'");
    expect(metadata).toContain("itemsDataKey: 'providerDefinitions'");
    expect(metadata).toContain("component: { key: 'provider-credentials', readOnly: false }");
    expect(metadata).toContain("contentKey: 'secretsHelp'");
    expect(metadata).toContain('collapsible: true');
    expect(metadata.match(/initiallyCollapsed: true/g)?.length).toBeGreaterThanOrEqual(2);
    expect(metadata).toContain("span: { expression: \"provider.option.tenant != null ? 6 : 12\" }");
    expect(metadata).toContain("editable: { expression: \"mode === 'create'\" }");
    expect(metadata).toContain("provider.option.tenant != null");
    expect(metadata).not.toContain("provider.value === 'microsoft'");
  });

  it('keeps the credential workflow compound while reusing canonical field components internally', async () => {
    const credentials = await source('views/pages/metadata-driven/ui-components/provider-credentials.ejs');
    expect(credentials).toContain("include('../field-components/text-field'");
    expect(credentials).toContain("key: 'clientId'");
    expect(credentials).toContain('data-provider-client-secret');
    expect(credentials).toContain('data-provider-test-credentials');
    expect(credentials).toContain('data-provider-change-credentials');
    expect(credentials).toContain('data-provider-credential-mutation');
    expect(credentials).not.toContain("|| 'microsoft'");
    expect(credentials).toContain('const hasStoredPair = Boolean(item.clientId) && hasStoredSecret;');
    expect(credentials).toContain("title: 'No credentials stored'");
    expect(credentials).toContain('data-bs-target="#removeProviderCredentialsModal"');
    expect(credentials).not.toContain("include('contextual-help'");
    expect(credentials).toContain("include('information-panel'");
    expect(credentials).not.toContain('class="ms-auto d-flex align-items-center gap-2 small"');
  });

  it('uses one provider runtime and one canonical dirty predicate for Save and Cancel navigation', async () => {
    const forms = await source('public/js/forms.js');
    const runtime = await source('public/js/components/external-provider.js');

    // Provider behavior belongs exclusively to its compound component runtime.
    // A stale second implementation in forms.js used to register duplicate
    // credential-test/change handlers and allowed the two paths to drift.
    expect(forms).not.toContain('External-auth provider editor: provider defaults, credential lifecycle and help content.');
    expect(runtime).toContain('External-auth provider compound UI component.');

    // Save enablement and the unsaved-navigation modal must agree. Compound
    // components can own posted values that are not projected into dataCurrent.
    expect(forms).toContain("const changed = typeof sharedState.isDirty === 'function'");
    expect(forms).not.toContain('const ctxDirty =');
    expect(forms).toContain("document.addEventListener('hide.bs.modal'");
  });

  it('keeps provider-specific behavior in component/runtime data rather than generic entity renderer branches', async () => {
    const runtime = await source('public/js/components/external-provider.js');
    const renderer = await source('views/pages/metadata-driven/bo-entry-metadata.ejs');
    expect(runtime).toContain('data-contextual-help-key');
    expect(runtime).toContain("url.searchParams.set('tab', 'secrets')");
    expect(runtime).toContain('payload.statusUrl');
    expect(runtime).toContain('setVerificationIndicator(true)');
    expect(runtime).not.toContain("provider.value === 'facebook'");
    expect(runtime).not.toContain("key === 'microsoft'");
    expect(runtime).not.toContain('data-microsoft-tenant');
    expect(renderer).not.toContain("definition.key === 'sys-ext-auth-providers'");
  });

  it('creates only from unconfigured provider options and applies provider defaults live', async () => {
    const routes = await source('src/routes/sysbo-routes.ts');
    const renderer = await source('views/pages/metadata-driven/bo-entry-metadata.ejs');
    const runtime = await source('public/js/components/external-provider.js');

    expect(routes).toContain('const configuredKeys = new Set');
    expect(routes).toContain('externalAuthProviderDefinitions.filter');
    expect(routes).toContain('pageReferenceData.provider = externalAuthProviderDefinitions.map');
    expect(renderer).toContain('referenceValues[field.key]');
    expect(runtime).toContain('option.dataset.enumItem');
    expect(runtime).toContain('optionMetadata(option).callbackPath');
    expect(runtime).toContain('find((option) => option.value && !option.disabled)');
    expect(runtime).toContain("callback.dispatchEvent(new Event('change', { bubbles: true }))");
  });

  it('resolves immutable provider identity server-side when saving an existing record', async () => {
    const routes = await source('src/routes/sysbo-routes.ts');

    // Read-only enum/select controls are disabled in the browser and therefore
    // are not part of FormData. Existing provider saves must resolve the immutable
    // provider from the persisted record instead of treating a missing posted
    // value as provider ''.
    expect(routes).toContain('let provider = String(req.body.provider');
    expect(routes).toContain('if (id) {');
    expect(routes).toContain('existingProvider = await apiClient.get<Record<string, unknown>>');
    expect(routes).toContain('provider = String(existingProvider.data.provider');
    expect(routes).toContain('?tab=secrets');
    expect(routes).toContain("req.body.providerCredentialMutation === 'true'");
    expect(routes).toContain("field.key === 'clientId'");
  });

  it('keeps callback, verification and secret material server-controlled', async () => {
    const metadata = await source('../shared/src/bo-ui-metadata.ts');
    const credentials = await source('views/pages/metadata-driven/ui-components/provider-credentials.ejs');
    expect(metadata).toContain('administrators cannot override it');
    expect(metadata).toContain('clientId: { editable: false }');
    expect(credentials).toContain('Secret stored securely');
    expect(credentials).not.toContain('value="<%= item.clientSecret');
  });

  it('preserves provider-specific contextual guidance without a provider-specific help renderer', async () => {
    const help = await source('views/pages/metadata-driven/ui-components/contextual-help.ejs');
    const confirmations = await source('views/popups/messages/bo-edit-confirmations.ejs');
    expect(help).toContain('component?.options');
    expect(help).toContain('componentBindings');
    expect(help).toContain("include('information-panel'");
    expect(help).not.toContain("'microsoft'");
    expect(help).not.toContain("'google'");
    expect(confirmations).toContain('This command is applied immediately');
    expect(confirmations).toContain('Secrets tab will reopen ready for a replacement pair');
  });
});
