import ejs from 'ejs';
import { load } from 'cheerio';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { popupContent } from '../src/presentation/popup-content.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const resetView = resolve(testDirectory, '../views/pages/password-reset.ejs');

describe('password reset presentation', () => {
  it('renders a validated password modal for a usable token', async () => {
    const html = await ejs.renderFile(resetView, {
      csrfToken: 'test-csrf',
      popupContent,
      token: 'token-value',
      tokenInfo: { userId: 'user-1', subjectLabel: 'Admin' },
    });
    const $ = load(html);

    expect($('#passwordResetModal').hasClass('auth-primary-modal')).toBe(true);
    expect($('#resetPassword').hasClass('password-policy-input')).toBe(true);
    expect($('#resetPasswordConfirm').is('[data-password-confirmation]')).toBe(true);
    expect($('[data-rule="match"]').length).toBe(1);
    expect($('[data-password-submit]').is('[disabled]')).toBe(true);
    expect($('.auth-entry-copy strong').text()).toBe('Admin');
  });

  it('offers a new recovery request when the link is unusable', async () => {
    const html = await ejs.renderFile(resetView, {
      csrfToken: 'test-csrf',
      popupContent,
      token: 'expired-token',
      tokenInfo: null,
    });
    const $ = load(html);

    expect($('#passwordResetModalLabel').text()).toContain('Password link unavailable');
    expect($('.auth-password-link-unavailable-body').length).toBe(1);
    expect($('[data-bs-target="#passwordRequestModal"]').text()).toContain('Request a new link');
    expect($('[data-bs-target="#signInModal"]').text()).toContain('Back to sign in');
  });
});
