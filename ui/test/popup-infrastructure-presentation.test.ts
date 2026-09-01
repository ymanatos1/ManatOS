import ejs from 'ejs';
import { readFile } from 'node:fs/promises';
import { load } from 'cheerio';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { popupContent } from '../src/presentation/popup-content.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const horizontalNavView = resolve(testDirectory, '../views/partials/horizontal-nav.ejs');
const preferencesView = resolve(testDirectory, '../views/popups/other/preferences-modal.ejs');

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

    expect($('#preferencesModal .modal-header .modal-title').text()).toContain('Website user preferences');
    expect($('#preferencesModal .popup-footer-right #savePreferencesButton').length).toBe(1);
  });
  it('moves focus outside a modal before Bootstrap applies aria-hidden and restores the opener afterwards', async () => {
    const shellScript = await readFile(resolve(testDirectory, '../public/js/shell.js'), 'utf8');

    expect(shellScript).toContain("modal.addEventListener('hide.bs.modal'");
    expect(shellScript).toContain('modal.contains(active)');
    expect(shellScript).toContain('queueMicrotask(() =>');
    expect(shellScript).toContain('modal.contains(focused)');
    expect(shellScript).toContain("modal.addEventListener('hidden.bs.modal'");
    expect(shellScript).toContain('returnFocusTarget.focus({ preventScroll: true })');
  });

});
