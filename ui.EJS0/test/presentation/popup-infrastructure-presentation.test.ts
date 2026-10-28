import ejs from 'ejs';
import { readFile } from 'node:fs/promises';
import { load } from 'cheerio';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { resolveMetadataText } from '@manatos/shared';

import { popupContent } from '../../src/presentation/popup/popup-content.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const metadataText = (value: string) => resolveMetadataText(value, 'EN');
const uiSource = (relativePath: string) =>
  readFile(resolve(testDirectory, '..', '..', relativePath), 'utf8');
const horizontalNavView = resolve(
  testDirectory,
  '../../views/components/navigation/horizontal-nav.ejs',
);
const preferencesView = resolve(
  testDirectory,
  '../../views/popups/preferences/preferences-modal.ejs',
);
const popupHeaderView = resolve(testDirectory, '../../views/popups/shared/popup-header.ejs');

describe('popup infrastructure presentation', () => {
  it('projects client-opened popup surfaces as canonical nested V2 ctx.ui levels', async () => {
    const runtime = await uiSource('public/js/popups/popup-runtime.js');
    const contextRuntime = await uiSource('public/js/runtime/context-runtime.js');
    const uiHost = await uiSource('public/js/runtime/ui-host-runtime.js');
    const typedUiHost = await uiSource('src/browser/browser-host-bridge.ts');

    expect(runtime).toContain('const uiLeaf = () =>');
    expect(runtime).toContain('const openUiLevel = (');
    expect(runtime).toContain("host: 'popup'");
    expect(runtime).toContain('window.ManatOS?.uiHost?.openSurface?.({');
    expect(runtime).toContain('window.ManatOS?.uiHost?.updateChildSurface?.(handle, patch');
    expect(runtime).toContain('window.ManatOS?.uiHost?.closeSurface?.(handle');
    expect(runtime).toContain('const ensureModalSurface = (modal) =>');
    expect(runtime).not.toContain('syncModalContext');
    expect(typedUiHost).toContain('readonly data?: Readonly<Record<string, unknown>> | null;');
    expect(typedUiHost).toContain('...(input.data ? structuredClone(input.data) : {}),');
    expect(runtime).not.toContain('action: `popup-${phase}`');
    expect(typedUiHost).toContain("owner.deactivate(parent, 'browser-host-bridge');");
    expect(typedUiHost).not.toContain(
      "{ ...parentState, lifecycle: 'deactivating', active: false }",
    );
    expect(typedUiHost).toContain(
      "if (result.status === 'closed' && host !== 'embedded' && parent && !parent.isStructuralRoot)",
    );
    expect(typedUiHost).toContain('runtime.activate(parent, source);');
    expect(uiHost).not.toContain("action: 'reactivate-parent-surface'");
    expect(typedUiHost).toContain(
      '...(input.entityKey ? { entityKey: String(input.entityKey) } : {}),',
    );
    expect(typedUiHost).toContain("kind === 'entry' && input.entityKey");
    expect(typedUiHost).toContain('const normalizedEntry =');
    expect(typedUiHost).toContain('original: structuredClone(asRecord(entry.original) ?? {})');
    expect(typedUiHost).toContain('current: structuredClone(asRecord(entry.current) ?? {})');
    expect(typedUiHost).toContain('entryFields(');
    expect(contextRuntime).toContain('installEntryMirrors();');
    expect(runtime).toContain('snapshotDescriptors');
    expect(runtime).toContain('const popupRecoverable = (invocation) =>');
    expect(runtime).toContain('canonicalPopupPresentation(invocation)?.recoverable !== false');
    expect(runtime).toContain('restoreDescriptor');
  });

  it('does not duplicate signed-in identity in horizontal navigation', async () => {
    const html = await ejs.renderFile(horizontalNavView, {
      metadataText,
      currentUser: { name: 'Admin', role: 'Admin' },
      app: {
        navigation: {
          horizontal: [{ text: 'Home', url: '/', icon: 'bi-house', children: [] }],
        },
      },
    });
    const $ = load(html);

    expect($('.horizontal-user-identity')).toHaveLength(0);
    expect($('.horizontal-language-nav')).toHaveLength(1);
  });

  it('keeps stable rich-popup copy in the centralized semantic content model', () => {
    expect(popupContent.auth.createAccount.contentTitle).toBe('Welcome!');
    expect(popupContent.auth.createAccount.contentParagraphs).toHaveLength(2);
    expect(popupContent.auth.signIn.contentParagraphs).toHaveLength(2);
    expect(popupContent.auth.passwordRequest.contentTitle).toBe('Recover access to your account');
  });

  it('uses the shared popup header and footer conventions for independent form popups', async () => {
    const html = await ejs.renderFile(preferencesView, {
      currentUser: { id: 'user-1' },
      metadataText,
    });
    const $ = load(html);

    expect($('#preferencesModal .modal-header .modal-title').text()).toContain(
      'Website user preferences',
    );
    expect($('#preferencesModal .popup-footer-right #savePreferencesButton').length).toBe(1);
  });
  it('places popup CTX inspection immediately before the shared close action', async () => {
    const html = await ejs.renderFile(popupHeaderView, {
      labelId: 'testPopupLabel',
      modalTitle: 'Test popup',
    });
    const $ = load(html);
    const actions = $('.modal-header > .d-flex').children();

    expect(actions.eq(0).is('[data-popup-ctx-inspect]')).toBe(true);
    expect(actions.eq(1).is('.btn-close')).toBe(true);
    expect($('.modal-title').is('[data-v2-layout-caption]')).toBe(true);
  });

  it('keeps every popup explicit while leaving Developer Tools interactive above popup layers', async () => {
    const popupRuntime = await readFile(
      resolve(testDirectory, '../../public/js/popups/popup-runtime.js'),
      'utf8',
    );
    const layoutCss = await readFile(resolve(testDirectory, '../../public/css/layout.css'), 'utf8');

    expect(popupRuntime).toContain("modal.dataset.bsBackdrop = 'static'");
    expect(popupRuntime).toContain("modal.dataset.bsKeyboard = 'false'");
    expect(popupRuntime).toContain('uiHost?.isUserInputReady?.(path)');
    expect(popupRuntime).toContain('uiHost?.isUserInputReady?.(path) === false');
    expect(popupRuntime).not.toContain('deferredEscapePaths');
    expect(popupRuntime).toContain("modal.dataset.bsFocus = 'false'");
    expect(popupRuntime).toContain('const popupNestingDepth = () =>');
    expect(popupRuntime).toContain('const syncBootstrapModalStack = (modal, depth) =>');
    expect(popupRuntime).toContain('const modalZ = 1100 + normalizedDepth * 20');
    expect(popupRuntime).toContain('backdrop.style.zIndex = String(modalZ - 10)');
    expect(layoutCss).toContain('.manatos-popup-backdrop {');
    expect(layoutCss).toContain('z-index: 1100');
    expect(layoutCss).toContain('.developer-tools-dock {');
    expect(layoutCss).toContain('contain: size');
    expect(layoutCss).toContain('.developer-tools-dock.is-popup-inspection');
    expect(layoutCss).toContain('z-index: 1200');

    expect(popupRuntime).toContain('const toggleInspection =');
    expect(popupRuntime).toContain("classList.toggle('is-popup-inspection', raised)");
    expect(popupRuntime).toContain("button?.setAttribute('aria-pressed', String(raised))");
    expect(popupRuntime).toContain('toggleInspection({');
    expect(popupRuntime).toContain('clearInspection(ctxButton)');
  });

  it('derives nested popup placement from the parent V2 popup state without entity-specific branching', async () => {
    const popupRuntime = await readFile(
      resolve(testDirectory, '../../public/js/popups/popup-runtime.js'),
      'utf8',
    );

    expect(popupRuntime).toContain('const preparePopupPlacement =');
    expect(popupRuntime).toContain('anchorToTrigger = false');
    expect(popupRuntime).toContain('lastPopupTriggerRect = {');
    expect(popupRuntime).toContain('Number(resolvedAnchor.bottom ?? resolvedAnchor.top) + 8');
    expect(popupRuntime).toContain('const usableRight =');
    expect(popupRuntime).toContain('developerToolsDock.getBoundingClientRect()');
    expect(popupRuntime).toContain("parent?.level?.control?.host === 'popup'");
    expect(popupRuntime).toContain('parent.level.state?.popup');
    expect(popupRuntime).toContain('openedPopupsCounter');
    expect(popupRuntime).toContain('POPUP_CASCADE_DELTA_X');
    expect(popupRuntime).toContain('POPUP_CASCADE_DELTA_Y');
    expect(popupRuntime).toContain('const POPUP_CASCADE_DELTA_X = 56;');
    expect(popupRuntime).toContain('centeredX + POPUP_CASCADE_DELTA_X * openedPopupsCounter');
    expect(popupRuntime).toContain('openedPopupsCounter % 2 === 0 ? 1 : -1');
    expect(popupRuntime).not.toContain('Number(parentPopup.x) + direction');
    expect(popupRuntime).not.toContain('Number(parentPopup.y) + direction');
    expect(popupRuntime).toContain('preparePopupPlacement,');
  });

  it('requires popup producers to publish canonical surface kind rather than a second popup-kind vocabulary', async () => {
    const producerPaths = [
      '../../views/popups/preferences/preferences-modal.ejs',
      '../../views/popups/shared/message-popup.ejs',
      '../../views/popups/auth/auth-modals.ejs',
      '../../views/popups/messages/bo-edit-confirmations.ejs',
      '../../views/pages/system-settings.ejs',
      '../../views/pages/external-link.ejs',
      '../../views/pages/account-password.ejs',
      '../../views/pages/password-reset.ejs',
      '../../views/pages/external-registration.ejs',
      '../../views/pages/external-existing-account.ejs',
      '../../views/components/sysbo/entry/fields/picture-editor.ejs',
    ];
    for (const relativePath of producerPaths) {
      const source = await readFile(resolve(testDirectory, relativePath), 'utf8');
      expect(source).not.toContain('data-popup-kind=');
      expect(source).toContain('data-surface-kind="custom"');
    }

    const shell = await readFile(resolve(testDirectory, '../../public/js/shell/shell.js'), 'utf8');
    const recovery = await readFile(
      resolve(testDirectory, '../../src/runtime/workspace-recovery.ts'),
      'utf8',
    );
    expect(shell).toContain("modal.dataset.surfaceKind = 'custom'");
    expect(recovery.match(/modal\.dataset\.surfaceKind = 'custom'/g)).toHaveLength(2);
  });

  it('moves focus outside a modal before Bootstrap applies aria-hidden and restores the opener afterwards', async () => {
    const popupRuntime = await readFile(
      resolve(testDirectory, '../../public/js/popups/popup-runtime.js'),
      'utf8',
    );

    expect(popupRuntime).toContain("modal.addEventListener('hide.bs.modal'");
    expect(popupRuntime).toContain('const focused = document.activeElement;');
    expect(popupRuntime).toContain('const releaseModalFocus = (modal) =>');
    expect(popupRuntime).toContain('releaseModalFocus(modal);');
    expect(popupRuntime).toContain('queueMicrotask(() =>');
    expect(popupRuntime).toContain('modal.contains(focused)');
    expect(popupRuntime).toContain("modal.addEventListener('hidden.bs.modal'");
    expect(popupRuntime).toContain('target.focus({ preventScroll: true })');
  });

  it('projects Bootstrap popups through the canonical V2 surface contract without owning semantic lifecycle state', async () => {
    const popupRuntime = await readFile(
      resolve(testDirectory, '../../public/js/popups/popup-runtime.js'),
      'utf8',
    );
    const recordSelector = await readFile(
      resolve(testDirectory, '../../public/js/popups/record-selector.js'),
      'utf8',
    );

    expect(popupRuntime).toContain('kind: semanticPopupKind(modal, invocation)');
    expect(popupRuntime).toContain(
      "return canonicalSurfaceKinds.has(requested) ? requested : 'custom'",
    );
    expect(popupRuntime).toContain('name: purpose');
    expect(popupRuntime).not.toContain("kind: String(modal.dataset.popupKind || 'modal')");
    expect(popupRuntime).not.toContain('const createPayload =');
    expect(popupRuntime).toContain('invocation,');
    const uiHost = await readFile(
      resolve(testDirectory, '../../public/js/runtime/ui-host-runtime.js'),
      'utf8',
    );
    expect(uiHost).toContain('invocation: { ...invocation }');
    expect(popupRuntime).toContain('invocation.presentation?.layout');
    expect(popupRuntime).toContain('invocation.presentation?.title');
    expect(popupRuntime).toContain('presentation: canonicalPresentation || {');
    expect(popupRuntime).toContain(
      'const canonicalPresentation = canonicalPopupPresentation(invocation);',
    );
    expect(popupRuntime).not.toContain('state: { lifecycle:');
    expect(popupRuntime).toContain(
      "Bootstrap's shown/hide animation phases are host mechanics only",
    );
    expect(popupRuntime).toContain('never drive semantic UiLevel lifecycle state');
    expect(popupRuntime).toContain('const surfaceByModal = new WeakMap()');
    expect(popupRuntime).toContain('const handle = surfaceByModal.get(modal);');
    expect(popupRuntime).toContain('closeUiLevel(handle);');
    expect(popupRuntime).not.toContain('if (activeModal === modal)');
    expect(popupRuntime).toContain("[...document.querySelectorAll('.modal.show')]");
    expect(popupRuntime).toContain('handle = openUiLevel({');
    expect(popupRuntime).toContain('const popupPath = () => activePopupPath()');
    expect(popupRuntime).not.toContain("'ctx.page'");
    expect(recordSelector).not.toContain('popupRuntime?.popupPath?.()');
    expect(recordSelector).toContain('const v2Surface = popupRuntime?.openUiLevel?.({');
    expect(recordSelector).toContain('const popupPath = v2Surface.path');
    expect(recordSelector).not.toContain('fallbackPopupPath');
    expect(recordSelector).not.toContain("action: 'open-selector-surface'");
    expect(recordSelector).toContain('const popupRuntime = window.ManatOS?.popup?.runtime');
    expect(recordSelector).toContain('registerPhysicalSurfaceRetirer?.(retirePhysicalHost)');
    expect(recordSelector).toContain('const retirePhysicalHost = () =>');
    expect(recordSelector).not.toContain('popupRuntime?.createPayload?.({');
    expect(recordSelector).toContain('popupRuntime.updateUiLevel?.(');
  });

  it('installs popup lifecycle before auto-show bootstrapping and keeps shell recentering loosely coupled', async () => {
    const shellView = await readFile(
      resolve(testDirectory, '../../views/layout/shell.ejs'),
      'utf8',
    );
    const shellRuntime = await readFile(
      resolve(testDirectory, '../../public/js/shell/shell.js'),
      'utf8',
    );
    const popupRuntime = await readFile(
      resolve(testDirectory, '../../public/js/popups/popup-runtime.js'),
      'utf8',
    );

    const popupRuntimeIndex = shellView.indexOf('/js/popups/popup-runtime.js');
    const busyRuntimeIndex = shellView.indexOf('/js/shell/busy.js');
    expect(popupRuntimeIndex).toBeGreaterThan(-1);
    expect(busyRuntimeIndex).toBeGreaterThan(-1);
    expect(popupRuntimeIndex).toBeLessThan(busyRuntimeIndex);
    expect(shellRuntime).toContain(
      'window.ManatOS?.popup?.runtime?.refreshVisibleModalCenters?.()',
    );
    expect(popupRuntime).toContain('window.ManatOS.popup.runtime = Object.freeze');
    expect(popupRuntime).toContain('const registerBootstrapModal = (modal) =>');
    expect(popupRuntime).toContain(
      "document.querySelectorAll('.modal').forEach((modal) => registerBootstrapModal(modal))",
    );
    expect(popupRuntime).toContain('registerBootstrapModal,');
    expect(popupRuntime).toContain('const reconcileBootstrapModalStack = () =>');
    expect(popupRuntime).toContain('queueMicrotask(reconcileBootstrapModalStack)');
    expect(popupRuntime).toContain("document.body.classList.add('modal-open')");
    expect(shellRuntime).toContain(
      'window.ManatOS?.popup?.runtime?.registerBootstrapModal?.(modal)',
    );
    expect(popupRuntime).not.toContain('window.ManatOSPopupRuntime =');
  });

  it('applies universal Escape dismissal and viewport-bounded dropdown behavior across pages and popups', async () => {
    const shellRuntime = await readFile(
      resolve(testDirectory, '../../public/js/shell/shell.js'),
      'utf8',
    );
    const popupRuntime = await readFile(
      resolve(testDirectory, '../../public/js/popups/popup-runtime.js'),
      'utf8',
    );
    const pagesCss = await readFile(resolve(testDirectory, '../../public/css/pages.css'), 'utf8');

    expect(shellRuntime).toContain('const applyViewportDropdownBoundary =');
    expect(shellRuntime).toContain("toggle.setAttribute('data-bs-boundary', 'viewport')");
    expect(shellRuntime).toContain("if (event.key !== 'Escape'");
    expect(shellRuntime).not.toContain("document.querySelectorAll('.dropdown-menu.show')");
    expect(shellRuntime).toContain('Focus and ordinary field/dropdown presentation never change');
    expect(popupRuntime).toContain('const dismissalReady = (target = null) =>');
    expect(popupRuntime).toContain('uiHost?.isUserInputReady?.(target) === true');
    expect(popupRuntime).toContain('uiHost?.isUserInputReady?.(path) === false');
    expect(popupRuntime).not.toContain('deferredEscapePaths');
    expect(popupRuntime).not.toContain('escape-deferred');
    expect(shellRuntime).not.toContain('popup?.runtime?.dismissalReady?.(scope) !== true');
    expect(shellRuntime).toContain('window.ManatOS?.popup?.runtime?.requestDismiss?.(');
    expect(shellRuntime).toContain('visibleModal || visibleBackdrop || null');
    expect(popupRuntime).toContain('const bindDismissTarget = (handle, target) =>');
    expect(popupRuntime).toContain('const deepestRegisteredDismissPath = () =>');
    expect(popupRuntime).toContain('deepestRegisteredDismissPath() || uiLeaf()?.path');
    expect(popupRuntime).toContain('dismissTargetSurfaces.has(target)');
    expect(shellRuntime).toContain("'escape'");
    expect(shellRuntime).not.toContain('const universalDismissAction =');
    expect(pagesCss).toContain('.metadata-driven-record-form .dropdown-menu');
    expect(pagesCss).toContain('max-height: min(18rem, calc(100vh - 2rem))');
    expect(pagesCss).toContain('overscroll-behavior: contain');
  });
});
