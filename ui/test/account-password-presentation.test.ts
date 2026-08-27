import ejs from 'ejs';
import { load } from 'cheerio';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { popupContent } from '../src/presentation/popup-content.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const view = resolve(testDirectory, '../views/pages/account-password.ejs');

describe('account password presentation', () => {
  it('shows the signed-in user beside current password and uses busy-submit protection', async () => {
    const html = await ejs.renderFile(view, {
      csrfToken: 'test-csrf',
      popupContent,
      currentUser: {
        id: 'user-1',
        name: 'Admin',
        email: 'admin@example.test',
        emailVerified: true,
        enabled: true,
        role: 'Admin',
        hasPassword: true,
      },
    });
    const $ = load(html);
    const form = $('#accountPasswordModal form');

    expect($('#accountUserName').val()).toBe('Admin');
    expect($('#accountUserName').is('[readonly]')).toBe(true);
    expect($('#currentPassword').length).toBe(1);
    expect(form.attr('data-busy-submit')).not.toBeUndefined();
    expect(form.attr('data-busy-title')).toContain('Changing your password');
    expect($('[data-rule="match"]').length).toBe(1);
    expect($('[data-password-submit]').is('[disabled]')).toBe(true);
  });
});
