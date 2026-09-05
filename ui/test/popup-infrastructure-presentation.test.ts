import ejs from 'ejs';
import { readFile } from 'node:fs/promises';
import { load } from 'cheerio';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { popupContent } from '../src/presentation/popup-content.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const horizontalNavView = resolve(
  testDirectory,
  '../views/components/navigation/horizontal-nav.ejs',
);
const preferencesView = resolve(testDirectory, '../views/popups/preferences/preferences-modal.ejs');
const popupHeaderView = resolve(testDirectory, '../views/popups/shared/popup-header.ejs');

describe('popup infrastructure presentation', () => {
  it('renders signed-in identity immediately before the language selector', async () => {
    const html = await ejs.renderFile(horizontalNavView, {
      currentUser: { name: 'Admin', role: 'Admin' },
      app: {
        navigation: {
          horizontal: [{ text: 'Home', url: '/', icon: 'bi-house', children: [] }],
        },
      },
    });
    const $ = load(html);

    expect($('.horizontal-user-identity .horizontal-user-name').text().trim()).toBe('Admin');
    expect($('.horizontal-user-identity .horizontal-user-role').text().trim()).toBe('Admin');
    expect($('.horizontal-user-identity').nextAll('.horizontal-language-nav').length).toBe(1);
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
      resolve(testDirectory, '../public/js/popups/popup-runtime.js'),
      'utf8',
    );
    const layoutCss = await readFile(resolve(testDirectory, '../public/css/layout.css'), 'utf8');

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

  it('moves focus outside a modal before Bootstrap applies aria-hidden and restores the opener afterwards', async () => {
    const popupRuntime = await readFile(
      resolve(testDirectory, '../public/js/popups/popup-runtime.js'),
      'utf8',
    );

    expect(popupRuntime).toContain("modal.addEventListener('hide.bs.modal'");
    expect(popupRuntime).toContain('modal.contains(active)');
    expect(popupRuntime).toContain('queueMicrotask(() =>');
    expect(popupRuntime).toContain('modal.contains(focused)');
    expect(popupRuntime).toContain("modal.addEventListener('hidden.bs.modal'");
    expect(popupRuntime).toContain('target.focus({ preventScroll: true })');
  });

  it('projects Bootstrap popups into the same callingParams/presentation/state CTX contract as custom popups', async () => {
    const popupRuntime = await readFile(
      resolve(testDirectory, '../public/js/popups/popup-runtime.js'),
      'utf8',
    );
    const recordSelector = await readFile(
      resolve(testDirectory, '../public/js/popups/record-selector.js'),
      'utf8',
    );

    expect(popupRuntime).toContain("kind: String(modal.dataset.popupKind || 'modal')");
    expect(popupRuntime).toContain('const createPayload =');
    expect(popupRuntime).toContain('callingParams: { ...callingParams }');
    expect(popupRuntime).toContain('callingParams.presentationMode');
    expect(popupRuntime).toContain('callingParams.title');
    expect(popupRuntime).toContain('presentation: {');
    expect(popupRuntime).toContain('state: {');
    expect(popupRuntime).toContain(
      "const popupPath = () => `${leafPagePath() || 'ctx.page'}.popup`",
    );
    expect(recordSelector).toContain('popupRuntime?.popupPath?.()');
    expect(recordSelector).toContain('const popupRuntime = window.ManatOSPopupRuntime');
    expect(recordSelector).toContain('popupRuntime?.createPayload?.({');
  });

  it('installs popup lifecycle before auto-show bootstrapping and keeps shell recentering loosely coupled', async () => {
    const shellView = await readFile(resolve(testDirectory, '../views/layout/shell.ejs'), 'utf8');
    const shellRuntime = await readFile(resolve(testDirectory, '../public/js/shell.js'), 'utf8');

    const popupRuntimeIndex = shellView.indexOf('/js/popups/popup-runtime.js');
    const busyRuntimeIndex = shellView.indexOf('/js/busy.js');
    expect(popupRuntimeIndex).toBeGreaterThan(-1);
    expect(busyRuntimeIndex).toBeGreaterThan(-1);
    expect(popupRuntimeIndex).toBeLessThan(busyRuntimeIndex);
    expect(shellRuntime).toContain('window.ManatOSPopupRuntime?.refreshVisibleModalCenters?.()');
  });
});
