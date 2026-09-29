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
    const entryRepresentation = await source('public/js/sysbo/entry/entry-representation.js');
    const runtimeEntry = await source('src/browser/runtime-entry.ts');

    expect(reference).toContain("action: 'view-entry'");
    expect(reference).toContain('View selected entry');
    expect(reference).toContain("action: 'add-entry'");
    expect(reference).toContain('referenceRelationship?.selection?.createRelated');
    expect(reference).toContain(
      "authorization: { entityKey: referenceTargetKey, capability: 'create' }",
    );
    expect(reference).not.toContain('resolveUIEntityPermissions');
    expect(fieldTools).toContain('hasUIEntityPermission(permissions, authorization.capability)');
    expect(field).toContain('createRelated = createRelated || {}');
    expect(field).toContain("case 'view-entry'");
    expect(field).toContain("purpose: 'view'");
    expect(field).toContain('ownerProviderForPath?.(pagePath)');
    expect(field).toContain('provideEntryIfPresent?.(');
    expect(field).toContain("identity.startsWith('draft:')");
    expect(field).toContain('const ownerDraft = Boolean(ownedTransfer');
    expect(field).not.toContain('_ownerEntryTransfer');
    expect(field).toContain('window.ManatOS?.ownerProviderForPath?.(pagePath)');
    expect(field).toContain('ownerSurface?.provideEntryIfPresent?.(');
    expect(field).toContain('const ownerDraft = Boolean(existingTransfer');
    expect(field).not.toContain('/owned-entry/${encodeURIComponent(identity)}');
    expect(field).toContain('entryOpening.open({');
    expect(field).not.toContain("_entryMode: 'view'");
    expect(field).toContain("case 'add-entry'");
    expect(field).toContain("purpose: 'create'");
    expect(field).toContain('const currentEntry =');
    expect(field).toContain(
      "resolvedEntry && typeof resolvedEntry === 'object' ? resolvedEntry : {}",
    );
    expect(field).not.toContain("if (!currentEntry || typeof currentEntry !== 'object') return");
    expect(field).toContain('composeCallerRules?.(');
    expect(field).toContain('rules,');
    expect(field).not.toContain('_entryDefaults');
    expect(field).not.toContain('_entryOverrides');
    expect(field).toContain("const id = String(result?.value || '')");
    expect(field).not.toContain('window.ManatOS?.refreshOwnedEntryReferenceOptions?.(pagePath)');
    expect(runtimeEntry).not.toContain("'data.resources.workspaceTransaction'");
    expect(runtimeEntry).toContain('refreshOwnedEntryReferenceOptions(candidate.context.path)');
    expect(field).toContain('syncReferenceOptionsFromCtx(root, control)');
    expect(field).not.toContain('const representation = result?.metadata?.representation || {}');
    expect(entryRepresentation).toContain(
      "ownerWorkspaceState: reference.__ownerWorkspaceState === 'owner-workspace'",
    );
    expect(renderer).toContain('resolveSysBOUIView(');
    expect(renderer).toContain('surface.uiViewKey ?? invocation.uiViewKey');
    expect(renderer).toContain('effectiveEntryUIMetadata(resolvedUIView.metadata, invocation)');
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
    expect(popup).toContain("hostStrategy: 'direct'");
    const representation = await source(
      'views/components/sysbo/entry/fields/field-representation.ejs',
    );
    const write = await source('src/routes/sysbo/entry/write.ts');
    const tree = await source('public/js/sysbo/hierarchy/hierarchy-tree.js');
    const shell = await source('public/js/shell/shell.js');

    expect(popup).toContain('const popupRuntime = window.ManatOS?.popup?.runtime');
    expect(popup).toContain('data-owner-context-badge');
    expect(popup).toContain('window.ManatOS?.ownerContextPresentation?.(popupSurface)');
    expect(representation).toContain('data-entry-link');
    expect(representation).toContain('data-entry-link-entity-key');
    expect(popup).not.toContain('<iframe');
    // Direct-host SSR is mounted with innerHTML, which leaves trusted component
    // bootstrap scripts inert unless the browser adapter activates them. The
    // adapter must reproduce full-page physical mounting without rebuilding CTX.
    expect(popup).toContain('const activateDirectHostScripts = (host) =>');
    expect(popup).toContain("host.querySelectorAll('script')");
    expect(popup).toContain('inertScript.replaceWith(script)');
    expect(popup).toContain('activateDirectHostScripts(contentHost);');
    expect(popup).not.toContain('hostedEscapeHandler');
    expect(popup).toContain('manatos:surface-cancellation-confirmed');
    expect(popup).toContain('event.detail?.path !== popupPath');
    expect(popup).toContain('close(result, true);');
    expect(popup).toContain("'[data-cancel-operation], [data-form-close-cancel]'");
    const entryState = await source('public/js/sysbo/entry/state.js');
    expect(entryState).toContain('runtime?.registerDismissHandler?.(');
    expect(entryState).toContain('{ path: entryPagePath }');
    expect(popup).toContain("popupRuntime.requestDismiss?.(v2Surface, 'close-button')");
    expect(shell).toContain('window.ManatOS?.popup?.runtime?.requestDismiss?.(');
    expect(shell).not.toContain('popup?.runtime?.dismissalReady?.(scope) !== true');
    expect(entryState).toContain('uiHost?.isUserInputReady?.(entryPagePath)');
    expect(shell).toMatch(/document\.addEventListener\(\s*'keydown',[\s\S]*?true,\s*\);/);
    expect(popup).toContain("target?.closest('a[data-entry-link], a[data-open-entry-popup]')");
    expect(popup).toContain('link.dataset.entryPopupEntityKey || null');
    expect(popup).toContain('link.dataset.entryLinkEntityKey || null');
    expect(popup).toContain('window.ManatOS.popup.entry = Object.freeze');
    expect(popup).toContain('openValueObject,');
    expect(popup).toContain(
      "window.ManatOS?.entryOpening?.open?.({ ...descriptor, host: 'popup' })",
    );
    expect(popup).toContain("parentPopup.backdrop.style.pointerEvents = 'none'");
    expect(popup).not.toContain('window.ManatOSEntryPopup =');
    expect(popup).not.toContain('data-ui-engine-migration');
    expect(popup).not.toContain('inheritUiEngine');
    expect(popup).not.toContain('directReadonlyRequested');
    expect(popup).toContain("hostedUrl.searchParams.set('_entryDirectHost', '1')");
    expect(popup).not.toContain("hostedUrl.searchParams.set('_entryRecoverable', '0')");
    expect(popup).toContain("if (requestMethod === 'POST')");
    expect(popup).toContain("options.method = 'POST'");
    expect(popup).toContain("resolvedInvocation.presentation?.entryDensity === 'compact'");
    expect(popup).toContain("popupCard.classList.toggle('is-compact-entry', compactEntry)");
    expect(popup).toContain('resolvedInvocation.presentation?.autoCloseOnBackdrop === true');
    expect(popup).toContain('const requestHostedCancel = () =>');
    expect(popup).toContain(
      "contentHost.querySelector('[data-cancel-operation], [data-form-close-cancel]')",
    );
    expect(popup).toContain('popupRuntime?.openUiLevel?.({');
    expect(popup).toContain('if (!v2Surface) return null');
    expect(popup).toContain('const popupPath = v2Surface.path');
    expect(popup).not.toContain('legacyPopupPath');
    expect(popup).not.toContain('legacyProjectionPath');
    expect(popup).not.toContain('.popup`');
    expect(popup).toContain("kind: 'entry'");
    expect(popup).toContain("layout: resolvedInvocation.presentation?.layout || 'entry'");
    expect(popup).toContain("entryDensity: compactEntry ? 'compact' : 'normal'");
    expect(popup).not.toContain('resolvedCallingParams');
    expect(popup).not.toContain('cloneCtxValue');
    expect(popup).not.toContain('deepestEntryLevel');
    expect(popup).toContain("makeSurfaceResult('saved'");
    expect(popup).toContain("makeSurfaceResult('cancelled')");
    expect(popup).toContain('onSaved(surfaceResult)');
    expect(popup).not.toContain('onSaved(data, surfaceResult)');
    expect(popup).toContain('onClose(surfaceResult)');
    expect(popup).toContain('popupRuntime?.hydrateEntrySurface?.(v2Surface, data.bootstrap)');
    expect(popup).not.toContain("action: 'mirror-hosted-entry-state'");
    expect(popup).toContain('if (!uiLevelAlreadyClosed) popupRuntime.closeUiLevel(v2Surface);');
    expect(popup).not.toContain("hostedWindow.addEventListener('manatos:ctx-change'");
    expect(popup).not.toContain("hostedWindow.addEventListener('manatos:ctx-ready'");
    expect(popup).not.toContain('hostedEntry.fields');
    expect(popup).not.toContain('hostedEntry.facts');
    expect(popup).not.toContain('hostedEntry.entry');
    expect(popup).toContain("kind: 'entry'");
    expect(popup).not.toContain("kind: 'entry-popup'");
    expect(popup).toContain("'manatos:entry-popup-saved'");
    expect(popup).toContain("makeSurfaceResult('cancelled')");
    expect(popup).toContain('resolveReady?.(true)');
    expect(popup).toContain("popupCard?.classList.remove('manatos-popup-initializing')");
    expect(popup).toContain("backdrop.classList.add('manatos-popup-show-spinner')");
    expect(popup).toContain('}, 220);');
    expect(popup).toContain("new CustomEvent('manatos:entry-opening-measured'");
    expect(popup).toContain("fetch('/bo/debug/ui-runtime/entry-opening-measurement'");
    expect(popup).toContain('measurement: latest');
    expect(popup).toContain('clickToReadyMs:');
    expect(popup).toContain('clickToFirstVisibleContentMs:');
    expect(popup).toContain('spinnerShown: spinnerShownAt != null');
    expect(popup).toContain("hostStrategy: 'direct'");
    expect(popup).toContain("fetch('/bo/debug/ui-runtime/entry-opening-measurement'");
    expect(popup).toContain("type: 'entry-opening-measurement'");
    expect(popup).toContain('measurement: latest');
    expect(popup).toContain('measurements: () => [...openingMetrics]');
    expect(popup).toContain('clearMeasurements: () => openingMetrics.splice(0)');
    expect(popup).toContain(
      "backdrop.className = 'manatos-popup-backdrop manatos-popup-preparing'",
    );
    expect(popup).toContain("backdrop.classList.remove('manatos-popup-preparing')");
    expect(popup).toContain('window.setTimeout(() =>');
    expect(popup).toContain("parentPopup.backdrop.setAttribute('aria-hidden', 'true')");
    expect(popup).not.toContain("'manatos:entry-popup-size'");
    expect(popup).toContain('new MutationObserver');
    expect(popup).toContain('hostedMutationObserver.observe(form');
    expect(popup).not.toContain('data-entry-popup-height-difference');
    expect(popup).not.toContain('data-entry-popup-height-toggle');
    expect(popup).toContain('popupRuntime?.preparePopupPlacement?.');
    expect(popup).toContain('anchorToTrigger,');
    expect(popup).toContain('const requestedHeight = compactEntry ? 300 : 820');
    expect(popup).toContain('const idealTop = anchorToTrigger ? originalPopupTop');
    expect(popup).toContain('state: { popup: { ...popupPlacement } }');
    expect(popup).toContain("popupCard.classList.add('is-positioned')");
    expect(popup).toContain('popupCard.style.left = `${popupPlacement.x}px`');
    expect(popup).toContain('popupCard.style.top = `${popupPlacement.y}px`');
    expect(popup).toContain('const estimateHostedHeightDifference = () =>');
    expect(popup).toContain('scheduleHostedHeightEstimate()');
    expect(popup).not.toContain('frame.contentWindow');
    expect(popup).toContain("document.addEventListener('shown.bs.tab', hostedTabHandler)");
    expect(popup).toContain('hostedMutationObserver.observe(form');
    expect(popup).toContain('const baselineCenterY = originalPopupTop + originalPopupHeight / 2;');
    expect(popup).toContain('applyPopupHeightDifference(estimatedHeightDifference)');
    expect(popup).toContain('const hostRect = contentHost.getBoundingClientRect();');
    expect(popup).toContain('formRect.top - hostRect.top');
    expect(popup).toContain(
      "popupCard.style.setProperty('height', `${targetHeight}px`, 'important')",
    );
    expect(popup).toContain('data-related-entry-view-popup');
    expect(popup).toContain("purpose: 'view'");
    expect(popup).toContain('entryOpening.open({');
    expect(popup).not.toContain("targetUrl.searchParams.set('_entryMode', 'view')");
    expect(popup).not.toContain('hostedWindow');
    expect(popup).toContain("querySelector('.metadata-driven-record-form')");
    expect(popup).toContain('const intrinsicFormHeight = Math.max(');
    expect(popup).toContain('topInset + intrinsicFormHeight + bottomGutter');
    expect(popup).toContain('const POPUP_HEIGHT_ESTIMATE_CORRECTION = compactEntry ? 18 : 25;');
    expect(popup).toContain(
      'desiredPopupHeight - originalPopupHeight + POPUP_HEIGHT_ESTIMATE_CORRECTION',
    );
    expect(popup).toContain('const clampPopupHeight = (height) =>');
    expect(popup).toContain('entryForm.scrollHeight');
    expect(popup).toContain('data-entry-popup-ctx');
    expect(tree).not.toContain("document.body.classList.contains('entry-popup-host')");
    expect(tree).toContain('Hosted entry documents delegate ManatOS.popup.entry.open()');
    expect(tree).toContain('entryOpening.open({');
    expect(write).toContain("type: 'manatos:entry-popup-saved'");
    expect(write).toContain("const close = saveMode === 'close'");
    expect(write).toContain("_entryMode: 'edit'");
    expect(popup).toContain('if (data.close === true) {');
    expect(popup).toContain('pendingSavedCloseResult = surfaceResult;');
    expect(popup).toContain('requestHostedCancel();');
    expect(popup).toContain('surfaceClosure?.requestTrigger?.(cancel, popupPath)');
    expect(write).toContain('resolveEntryRepresentation');
    expect(tree).toContain("purpose: 'view'");
    expect(tree).not.toContain("_entryMode: 'view'");

    const shellView = await source('views/layout/shell.ejs');
    expect(shellView).toContain('if (!isEntryPopupHost)');
    expect(shellView).not.toContain('body.entry-popup-host .workspace-heading-row');
    expect(shellView).not.toContain('body.entry-popup-host .workspace-titlebar');

    const pages = await source('public/css/pages.css');
    expect(pages).not.toContain('.entry-popup-height-estimate');
    expect(pages).not.toContain('[data-entry-popup-height-toggle]');
    expect(pages).toContain('width: min(1120px, calc(100vw - 3rem))');
    expect(pages).toContain('height: min(820px, calc(100vh - 3rem))');
    expect(pages).toContain('.metadata-entry-popup.is-compact-entry');
    expect(pages).toContain('width: min(540px, calc(100vw - 2rem))');
    expect(pages).toMatch(
      /\.entry-density-compact \[data-v2-entry-fields\] > \.col-md-6\s*\{\s*width: 50%;\s*\}/,
    );
    expect(pages).toContain('.metadata-entry-popup.is-positioned');
    expect(pages).toContain('height: min(300px, calc(100vh - 2rem))');
    expect(pages).toContain('.entry-density-compact .entity-tab-content > .tab-pane.active');
    expect(pages).toContain('box-shadow: none');
    expect(pages).toContain('flex-direction: column');
    expect(pages).toContain('flex: 1 1 auto');
    expect(pages).not.toContain('.metadata-entry-popup.manatos-popup-initializing iframe');

    const layout = await source('public/css/layout.css');
    expect(layout).toContain(
      '.manatos-popup-backdrop.manatos-popup-preparing .metadata-entry-popup',
    );
    expect(layout).toContain(
      '.manatos-popup-backdrop.manatos-popup-preparing.manatos-popup-show-spinner::before',
    );
  });
});
