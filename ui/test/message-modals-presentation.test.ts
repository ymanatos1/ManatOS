import ejs from 'ejs';
import { load } from 'cheerio';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const view = resolve(testDirectory, '../views/popups/messages/message-modals.ejs');

describe('message modal presentation', () => {
  it('supports a success title, message and explicit follow-up action', async () => {
    const html = await ejs.renderFile(view, {
      informationTitle: 'Password updated',
      informationMessage: 'Your password was updated successfully.',
      informationActionLabel: 'Sign in',
      informationActionUrl: '/?auth=signin',
    });
    const $ = load(html);

    expect($('#informationMessageModalLabel').text()).toContain('Password updated');
    expect($('#informationMessageModal .modal-body').text()).toContain('updated successfully');
    expect($('#informationMessageModal .modal-footer a').attr('href')).toBe('/?auth=signin');
    expect($('#informationMessageModal .modal-footer a').text()).toContain('Sign in');
  });

  it('supports a warning-specific title independently from success messages', async () => {
    const html = await ejs.renderFile(view, {
      warningTitle: 'Password changed with a warning',
      warningMessage: 'The confirmation email could not be sent.',
    });
    const $ = load(html);

    expect($('#warningMessageModalLabel').text()).toContain('Password changed with a warning');
    expect($('#warningMessageModal .modal-body').text()).toContain('could not be sent');
  });
});
