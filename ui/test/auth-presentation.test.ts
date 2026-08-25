import ejs from 'ejs';
import { load } from 'cheerio';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { availableProviders } from '../src/auth/external-providers.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const authModalsView = resolve(testDirectory, '../views/partials/auth-modals.ejs');
const externalLinkView = resolve(testDirectory, '../views/pages/external-link.ejs');
const externalExistingAccountView = resolve(testDirectory, '../views/pages/external-existing-account.ejs');

describe('authentication presentation', () => {
  it('renders Microsoft as a visible unavailable provider in sign-in and registration', async () => {
    const html = await ejs.renderFile(authModalsView, {
      currentUser: null,
      csrfToken: 'test-csrf',
      authProviders: availableProviders(),
    });

    const $ = load(html);

    const microsoftButtons = $('.auth-provider-button').filter((_index, element) =>
      $(element).text().includes('Microsoft'),
    );

    expect(microsoftButtons.length).toBe(2);
    expect(microsoftButtons.eq(0).text()).toContain('Register with Microsoft');
    expect(microsoftButtons.eq(1).text()).toContain('Continue with Microsoft');
    expect(microsoftButtons.eq(0).is('[disabled]')).toBe(true);
    expect(microsoftButtons.eq(1).is('[disabled]')).toBe(true);
    expect(microsoftButtons.eq(0).find('.bi-microsoft').length).toBe(1);
    expect(microsoftButtons.eq(1).find('.bi-microsoft').length).toBe(1);
  });

  it('uses provider metadata to render the external-link illustration and labels', async () => {
    const authProviders = availableProviders();
    const html = await ejs.renderFile(externalLinkView, {
      csrfToken: 'test-csrf',
      authProviders,
      profile: {
        provider: 'microsoft',
        providerSubject: 'microsoft-subject',
        email: 'yiannis@example.test',
        emailVerified: true,
        existingUserId: 'user-id',
        existingUserName: 'Yiannis',
      },
    });

    const $ = load(html);

    expect($('#externalLinkProvider').val()).toBe('Microsoft');
    expect($('.external-link-provider-tile .bi-microsoft').length).toBe(1);
    expect($('.external-link-manatos-tile img').length).toBe(1);
    expect($('.external-link-copy').text()).toContain('Microsoft');
    expect($('.external-link-copy').text()).toContain('yiannis@example.test');
  });
  it('renders purpose-specific welcome content and illustrations for sign-in and registration', async () => {
    const html = await ejs.renderFile(authModalsView, {
      currentUser: null,
      csrfToken: 'test-csrf',
      authProviders: availableProviders(),
    });

    const $ = load(html);

    expect($('#signInModal .auth-entry-copy h3').text().trim()).toBe('Welcome back');
    expect($('#signInModal .auth-entry-illustration.is-signin').length).toBe(1);
    expect($('#signInModal .auth-entry-action-tile .bi-box-arrow-in-right').length).toBe(1);

    expect($('#signUpMethodModal .auth-entry-copy h3').text().trim()).toBe('Welcome to ManatOS');
    expect($('#signUpMethodModal .auth-entry-illustration.is-register').length).toBe(1);
    expect($('#signUpMethodModal .auth-entry-action-tile .bi-person-plus').length).toBe(1);

    expect($('#signInModal .auth-method-card').length).toBe(2);
    expect($('#signUpMethodModal .auth-method-card').length).toBe(2);
  });

  it('renders Register with Email as its own visible registration action', async () => {
    const html = await ejs.renderFile(authModalsView, {
      currentUser: null,
      csrfToken: 'test-csrf',
      authProviders: availableProviders(),
    });

    const $ = load(html);
    const emailRegistrationButton = $('#signUpMethodModal .auth-email-registration-button');

    expect(emailRegistrationButton.length).toBe(1);
    expect(emailRegistrationButton.text()).toContain('Register with Email');
    expect(emailRegistrationButton.text()).toContain('Email and password');
    expect(emailRegistrationButton.attr('data-bs-target')).toBe('#emailRegistrationModal');
  });

  it('renders email registration as a polished second step with a Back path', async () => {
    const html = await ejs.renderFile(authModalsView, {
      currentUser: null,
      csrfToken: 'test-csrf',
      authProviders: availableProviders(),
    });
    const $ = load(html);
    const modal = $('#emailRegistrationModal');
    const backButton = modal.find('.auth-back-button');
    expect(modal.hasClass('auth-primary-modal')).toBe(true);
    expect(modal.find('.auth-email-registration-intro').length).toBe(1);
    expect(modal.find('.auth-entry-copy h3').text().trim()).toBe('Create your ManatOS account');
    expect(modal.find('.auth-registration-form-card').length).toBe(1);
    expect(modal.find('.auth-password-guidance').length).toBe(1);
    expect(backButton.length).toBe(1);
    expect(backButton.text()).toContain('Back');
    expect(backButton.attr('data-bs-target')).toBe('#signUpMethodModal');
    expect(backButton.attr('data-bs-toggle')).toBe('modal');
    expect(backButton.attr('data-bs-dismiss')).toBe('modal');
  });

  it('keeps external-provider sign-in and registration intent distinct', async () => {
    const html = await ejs.renderFile(authModalsView, {
      currentUser: null,
      csrfToken: 'test-csrf',
      authProviders: availableProviders(),
    });
    const $ = load(html);

    expect($('#signUpMethodModal a.auth-provider-button').filter((_index, element) =>
      $(element).text().includes('GitHub'),
    ).attr('href')).toBe('/auth/github?intent=register');

    expect($('#signInModal a.auth-provider-button').filter((_index, element) =>
      $(element).text().includes('GitHub'),
    ).attr('href')).toBe('/auth/github?intent=signin');
  });

  it('renders email registration as identity and security columns with live-submit hooks', async () => {
    const html = await ejs.renderFile(authModalsView, {
      currentUser: null,
      csrfToken: 'test-csrf',
      authProviders: availableProviders(),
    });
    const $ = load(html);
    const modal = $('#emailRegistrationModal');

    expect(modal.find('.auth-registration-identity-column #registrationName').length).toBe(1);
    expect(modal.find('.auth-registration-identity-column #registrationEmail').length).toBe(1);
    expect(modal.find('.auth-registration-security-column #registrationPassword').length).toBe(1);
    expect(modal.find('.auth-registration-security-column #registrationPasswordConfirm').length).toBe(1);
    expect(modal.find('.auth-registration-security-column .auth-password-guidance').length).toBe(0);
    expect(modal.find('.auth-registration-fields + .auth-password-guidance').length).toBe(1);
    expect(modal.find('[data-rule="match"]').length).toBe(1);
    expect(modal.find('[data-password-confirmation]').length).toBe(1);
    expect(modal.find('[data-password-submit]').is('[disabled]')).toBe(true);
  });

  it('renders a polite existing-account message for registration with an already-linked provider', async () => {
    const html = await ejs.renderFile(externalExistingAccountView, {
      csrfToken: 'test-csrf',
      authProviders: availableProviders(),
      profile: {
        provider: 'github',
        email: 'yiannis@manatos.eu',
        existingUserId: 'user-id',
        existingUserName: 'Yiannis',
      },
    });
    const $ = load(html);

    expect($('#externalExistingAccountModalLabel').text()).toContain('already have a ManatOS account');
    expect($('.external-link-copy').text()).toContain('Welcome back, Yiannis');
    expect($('.external-link-copy').text()).toContain('do not need to create another account');
    expect($('form').attr('action')).toBe('/auth/register/existing-external/signin');
    expect($('button[type="submit"]').text()).toContain('Sign in with GitHub');
  });

});
