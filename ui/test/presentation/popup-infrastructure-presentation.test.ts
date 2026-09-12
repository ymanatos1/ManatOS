import ejs from 'ejs';
import { readFile } from 'node:fs/promises';
import { load } from 'cheerio';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { popupContent } from '../../src/presentation/popup/popup-content.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));
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

    expect(runtime).toContain('const uiLeaf = () =>');
    expect(runtime).toContain('const openUiLevel = (');
    expect(runtime).toContain("lifecycle: 'deactivating', active: false");
    expect(runtime).toContain("lifecycle: 'active', active: true");
    expect(runtime).toContain("host: 'popup'");
    expect(runtime).toContain('runtime.replace(childPath, child');
    expect(runtime).toContain('const closeUiLevel = (handle) =>');
    expect(runtime).toContain('runtime.delete(handle.path');
    expect(runtime).toContain("action: 'reactivate-parent-surface'");
    expect(runtime).toContain('`${handle.parentPath}.control.state`');
    expect(runtime).toContain('...(entityKey ? { entityKey: String(entityKey) } : {}),');
    expect(runtime).toContain('snapshotDescriptors');
    expect(runtime).toContain('restoreDescriptor');
  });

  it('does not duplicate signed-in identity in horizontal navigation', async () => {
    const html = await ejs.renderFile(horizontalNavView, {
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
    const html = await ejs.renderFile(preferencesView, { currentUser: { id: 'user-1' } });
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
  });

  it('keeps every popup explicit while leaving Developer Tools interactive above popup layers', async () => {
    const popupRuntime = await readFile(
      resolve(testDirectory, '../../public/js/popups/popup-runtime.js'),
      'utf8',
    );
    const layoutCss = await readFile(resolve(testDirectory, '../../public/css/layout.css'), 'utf8');

    expect(popupRuntime).toContain("modal.dataset.bsBackdrop = 'static'");
    expect(popupRuntime).toContain("modal.dataset.bsKeyboard = 'false'");
    expect(popupRuntime).toContain("modal.dataset.bsFocus = 'false'");
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
    expect(popupRuntime).toContain("parent?.level?.control?.host === 'popup'");
    expect(popupRuntime).toContain('parent.level.control.state?.popup');
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

  it('moves focus outside a modal before Bootstrap applies aria-hidden and restores the opener afterwards', async () => {
    const popupRuntime = await readFile(
      resolve(testDirectory, '../../public/js/popups/popup-runtime.js'),
      'utf8',
    );

    expect(popupRuntime).toContain("modal.addEventListener('hide.bs.modal'");
    expect(popupRuntime).toContain('modal.contains(active)');
    expect(popupRuntime).toContain('queueMicrotask(() =>');
    expect(popupRuntime).toContain('modal.contains(focused)');
    expect(popupRuntime).toContain("modal.addEventListener('hidden.bs.modal'");
    expect(popupRuntime).toContain('target.focus({ preventScroll: true })');
  });

  it('projects Bootstrap popups into the same invocation/presentation/state CTX contract as custom popups', async () => {
    const popupRuntime = await readFile(
      resolve(testDirectory, '../../public/js/popups/popup-runtime.js'),
      'utf8',
    );
    const recordSelector = await readFile(
      resolve(testDirectory, '../../public/js/popups/record-selector.js'),
      'utf8',
    );

    expect(popupRuntime).toContain("kind: String(modal.dataset.popupKind || 'modal')");
    expect(popupRuntime).not.toContain('const createPayload =');
    expect(popupRuntime).toContain('invocation: { ...invocation }');
    expect(popupRuntime).toContain('invocation.presentation?.layout');
    expect(popupRuntime).toContain('invocation.presentation?.title');
    expect(popupRuntime).toContain('presentation: {');
    expect(popupRuntime).toContain('state: {');
    expect(popupRuntime).toContain('const surfaceByModal = new WeakMap()');
    expect(popupRuntime).toContain('handle = openUiLevel({');
    expect(popupRuntime).toContain('const popupPath = () => activePopupPath()');
    expect(popupRuntime).not.toContain("'ctx.page'");
    expect(recordSelector).not.toContain('popupRuntime?.popupPath?.()');
    expect(recordSelector).toContain('const v2Surface = popupRuntime?.openUiLevel?.({');
    expect(recordSelector).toContain('const popupPath = v2Surface.path');
    expect(recordSelector).not.toContain('fallbackPopupPath');
    expect(recordSelector).not.toContain("action: 'open-selector-surface'");
    expect(recordSelector).toContain('const popupRuntime = window.ManatOS?.popup?.runtime');
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
    expect(popupRuntime).not.toContain('window.ManatOSPopupRuntime =');
  });
});
