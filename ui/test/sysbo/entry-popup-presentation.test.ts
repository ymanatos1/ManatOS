import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');

describe('generic hosted metadata entry popup', () => {
  it('reuses the canonical entry route and caller override resolver for related creation', async () => {
    const field = await source('public/js/sysbo/entry/field-runtime.js');
    const reference = await source('views/components/sysbo/entry/fields/reference-select.ejs');
    const renderer = await source('src/routes/sysbo/entry/renderer.ts');
    const invocation = await source('src/routes/sysbo/entry/invocation.ts');
    const dataAccess = await source('src/routes/sysbo/shared/data-access.ts');
    const supplemental = await source('src/routes/sysbo/entry/supplemental-data.ts');
    const fieldTools = await source('views/components/sysbo/entry/fields/field-tools-menu.ejs');

    expect(reference).toContain("action: 'view-entry'");
    expect(reference).toContain('View selected entry');
    expect(reference).toContain("action: 'add-entry'");
    expect(reference).toContain('field.referenceSelection?.createRelated');
    expect(reference).toContain(
      "authorization: { entityKey: referenceTargetKey, capability: 'create' }",
    );
    expect(reference).not.toContain('resolveUIEntityPermissions');
    expect(fieldTools).toContain('hasUIEntityPermission(permissions, authorization.capability)');
    expect(field).toContain('createRelated = createRelated || {}');
    expect(field).toContain("case 'view-entry'");
    expect(field).toContain("purpose: 'view'");
    expect(field).toContain("_entryMode: 'view'");
    expect(field).toContain("case 'add-entry'");
    expect(field).toContain("purpose: 'create'");
    expect(field).toContain('const currentEntry =');
    expect(field).toContain(
      "resolvedEntry && typeof resolvedEntry === 'object' ? resolvedEntry : {}",
    );
    expect(field).not.toContain("if (!currentEntry || typeof currentEntry !== 'object') return");
    expect(field).toContain('_entryDefaults: JSON.stringify(defaults)');
    expect(field).toContain('_entryOverrides: JSON.stringify(overrides)');
    expect(field).toContain("const id = String(result?.value || '')");
    expect(field).toContain('const representation = result?.metadata?.representation || {}');
    expect(renderer).toContain('effectiveEntryUIMetadata(canonicalMetadataUI, invocation)');
    expect(renderer).toContain('referenceData: supplemental.referenceData');
    expect(renderer).toContain('entryRepresentationRuntime(');
    expect(renderer).toContain('supplemental.referenceData,');
    expect(invocation).toContain('fieldOverrides:');
    expect(dataAccess).not.toContain('resolveUIEntityPermissions');
    expect(supplemental).toContain('resolveUIEntityPermissions(req, targetDefinition)');
    expect(supplemental).toContain('relatedEntityPermissions');
  });

  it('returns canonical save results and lets hierarchy nodes host the same entry in view mode', async () => {
    const popup = await source('public/js/popups/entry-popup.js');
    const write = await source('src/routes/sysbo/entry/write.ts');
    const tree = await source('public/js/sysbo/hierarchy/hierarchy-tree.js');

    expect(popup).toContain('const popupRuntime = window.ManatOS?.popup?.runtime');
    expect(popup).toContain('window.ManatOS.popup.entry = Object.freeze');
    expect(popup).not.toContain('window.ManatOSEntryPopup =');
    expect(popup).not.toContain('data-ui-engine-migration');
    expect(popup).not.toContain('inheritUiEngine');
    expect(popup).toContain('frame.src = url');
    expect(popup).toContain('popupRuntime?.openUiLevel?.({');
    expect(popup).toContain('if (!v2Surface) return null');
    expect(popup).toContain('const popupPath = v2Surface.path');
    expect(popup).not.toContain('legacyPopupPath');
    expect(popup).not.toContain('legacyProjectionPath');
    expect(popup).not.toContain('.popup`');
    expect(popup).toContain("kind: 'entry'");
    expect(popup).toContain("layout: resolvedInvocation.presentation?.layout || 'entry'");
    expect(popup).not.toContain('resolvedCallingParams');
    expect(popup).not.toContain('cloneCtxValue');
    expect(popup).not.toContain('deepestEntryLevel');
    expect(popup).toContain("makeSurfaceResult('saved'");
    expect(popup).toContain("makeSurfaceResult('cancelled')");
    expect(popup).toContain('onSaved(surfaceResult)');
    expect(popup).not.toContain('onSaved(data, surfaceResult)');
    expect(popup).toContain('onClose(surfaceResult)');
    expect(popup).toContain('popupRuntime?.updateUiLevel?.(');
    expect(popup).not.toContain("action: 'mirror-hosted-entry-state'");
    expect(popup).toContain('popupRuntime.closeUiLevel(v2Surface)');
    expect(popup).not.toContain("hostedWindow.addEventListener('manatos:ctx-change'");
    expect(popup).not.toContain("hostedWindow.addEventListener('manatos:ctx-ready'");
    expect(popup).not.toContain('hostedEntry.fields');
    expect(popup).not.toContain('hostedEntry.facts');
    expect(popup).not.toContain('hostedEntry.entry');
    expect(popup).toContain("kind: 'entry'");
    expect(popup).not.toContain("kind: 'entry-popup'");
    expect(popup).toContain("'manatos:entry-popup-saved'");
    expect(popup).toContain("'manatos:entry-popup-cancel'");
    expect(popup).toContain("'manatos:entry-popup-ready'");
    expect(popup).toContain("popupCard?.classList.remove('manatos-popup-initializing')");
    expect(popup).toContain(
      "backdrop.className = 'manatos-popup-backdrop manatos-popup-preparing'",
    );
    expect(popup).toContain("backdrop.classList.remove('manatos-popup-preparing')");
    expect(popup).toContain('window.setTimeout(() =>');
    expect(popup).toContain("frame.setAttribute('aria-hidden', 'true')");
    expect(popup).not.toContain("'manatos:entry-popup-size'");
    expect(popup).toContain('new hostedWindow.MutationObserver');
    expect(popup).toContain('hostedMutationObserver.observe(hostedEntryForm');
    expect(popup).not.toContain('data-entry-popup-height-difference');
    expect(popup).not.toContain('data-entry-popup-height-toggle');
    expect(popup).toContain('popupRuntime?.preparePopupPlacement?.');
    expect(popup).toContain('state: { popup: { ...popupPlacement } }');
    expect(popup).toContain("popupCard.classList.add('is-positioned')");
    expect(popup).toContain('popupCard.style.left = `${popupPlacement.x}px`');
    expect(popup).toContain('popupCard.style.top = `${popupPlacement.y}px`');
    expect(popup).toContain('const estimateHostedHeightDifference = () =>');
    expect(popup).toContain('scheduleHostedHeightEstimate()');
    expect(popup).toContain('const baselineCenterY = originalPopupTop + originalPopupHeight / 2;');
    expect(popup).toContain('const idealTop = baselineCenterY - targetHeight / 2;');
    expect(popup).toContain('applyPopupHeightDifference(estimatedHeightDifference)');
    expect(popup).toContain(
      "popupCard.style.setProperty('height', `${targetHeight}px`, 'important')",
    );
    expect(popup).toContain('data-related-entry-view-popup');
    expect(popup).toContain("purpose: 'view'");
    expect(popup).toContain("targetUrl.searchParams.set('_entryMode', 'view')");
    expect(popup).toContain("hostedWindow.document.addEventListener('shown.bs.tab'");
    expect(popup).toContain("querySelector('.metadata-driven-record-form')");
    expect(popup).toContain('formRect.bottom + bottomGutter');
    expect(popup).toContain('const POPUP_HEIGHT_ESTIMATE_CORRECTION = 25;');
    expect(popup).toContain(
      'desiredPopupHeight - originalPopupHeight + POPUP_HEIGHT_ESTIMATE_CORRECTION',
    );
    expect(popup).toContain('const clampPopupHeight = (height) =>');
    expect(popup).toContain('data-entry-popup-ctx');
    expect(tree).not.toContain("document.body.classList.contains('entry-popup-host')");
    expect(tree).toContain('Hosted entry documents delegate ManatOS.popup.entry.open()');
    expect(write).toContain("type: 'manatos:entry-popup-saved'");
    expect(write).toContain("const close = saveMode === 'close'");
    expect(write).toContain("_entryMode: 'edit'");
    expect(popup).toContain('if (data.close === true) close(surfaceResult)');
    expect(write).toContain('resolveEntryRepresentation');
    expect(tree).toContain("purpose: 'view'");
    expect(tree).toContain("_entryMode: 'view'");

    const shell = await source('views/layout/shell.ejs');
    expect(shell).toContain('if (!isEntryPopupHost)');
    expect(shell).not.toContain('body.entry-popup-host .workspace-heading-row');
    expect(shell).not.toContain('body.entry-popup-host .workspace-titlebar');

    const pages = await source('public/css/pages.css');
    expect(pages).not.toContain('.entry-popup-height-estimate');
    expect(pages).not.toContain('[data-entry-popup-height-toggle]');
    expect(pages).toContain('width: min(1120px, calc(100vw - 3rem))');
    expect(pages).toContain('height: min(820px, calc(100vh - 3rem))');
    expect(pages).toContain('.metadata-entry-popup.is-positioned');
    expect(pages).toContain('flex-direction: column');
    expect(pages).toContain('flex: 1 1 auto');
    expect(pages).toContain('.metadata-entry-popup.manatos-popup-initializing iframe');

    const layout = await source('public/css/layout.css');
    expect(layout).toContain(
      '.manatos-popup-backdrop.manatos-popup-preparing .metadata-entry-popup',
    );
    expect(layout).toContain('.manatos-popup-backdrop.manatos-popup-preparing::before');
  });
});
