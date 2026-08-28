import ejs from 'ejs';
import { load } from 'cheerio';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getSysBODefinition } from '../src/sysbo/definitions.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const generalView = resolve(testDirectory, '../views/partials/ext-auth-provider-fields.ejs');
const secretsView = resolve(testDirectory, '../views/partials/ext-auth-provider-secrets.ejs');

const externalAuthProviderDefinitions = [
  {
    provider: 'microsoft',
    label: 'Microsoft',
    icon: 'bi-microsoft',
    scope: ['openid'],
    callbackPath: '/auth/microsoft/callback',
    tenant: 'common',
    generalHelp: {
      title: 'Microsoft setup help',
      steps: ['Configure the Microsoft redirect URI.'],
      configuredRule: 'Microsoft must be fully configured.',
    },
    secretsHelp: {
      title: 'Microsoft application credentials',
      introduction: 'Use the Entra application registration.',
      clientId: ['Copy Application (client) ID.'],
      clientSecret: ['Copy the secret Value. The Secret ID is not the client secret.'],
      warning: 'Store the generated value safely.',
    },
  },
  {
    provider: 'github',
    label: 'GitHub',
    icon: 'bi-github',
    scope: ['read:user'],
    callbackPath: '/auth/github/callback',
    generalHelp: {
      title: 'GitHub setup help',
      steps: ['Configure the GitHub callback URL.'],
      configuredRule: 'GitHub must be fully configured.',
    },
    secretsHelp: {
      title: 'GitHub OAuth App credentials',
      introduction: 'Use the GitHub OAuth App.',
      clientId: ['Copy Client ID.'],
      clientSecret: ['Generate and copy a client secret.'],
    },
  },
];

describe('external authentication provider editor presentation', () => {
  it('defines General info and Secrets tabs for provider administration', () => {
    const tabs = getSysBODefinition('sys-ext-auth-providers').uiMetadata.editViewModel.tabs;

    expect(tabs?.map((tab) => tab.id)).toEqual(['general', 'secrets']);
    expect(tabs?.find((tab) => tab.id === 'secrets')?.partial).toBe(
      '../partials/ext-auth-provider-secrets',
    );
  });

  it('keeps credentials in Secrets and provider configuration in General info', async () => {
    const locals = {
      item: {
        provider: 'github',
        callbackPath: '/auth/github/callback',
        clientId: 'github-client-id',
        hasClientSecret: true,
        credentialsVerified: true,
        credentialsVerifiedAt: '2026-08-27T12:00:00.000Z',
      },
      isNew: false,
      readOnly: false,
      credentialTest: null,
      externalAuthProviderDefinitions,
    };

    const general = load(await ejs.renderFile(generalView, locals));
    const secrets = load(await ejs.renderFile(secretsView, locals));

    expect(general('#provider').val()).toBe('github');
    expect(general('#callbackPath').val()).toBe('/auth/github/callback');
    expect(general('#callbackPath').is('[readonly]')).toBe(true);
    expect(general('#callbackPath').attr('name')).toBe('callbackPath');
    expect(general('#provider').closest('.input-group').find('[data-provider-icon] .bi-github').length).toBe(1);
    expect(general('#provider').closest('.col-md-6').length).toBe(1);
    expect(general('#callbackPath').closest('.col-md-6').length).toBe(1);
    expect(general('#clientId').length).toBe(0);
    expect(general('#clientSecret').length).toBe(0);

    expect(secrets('#clientId').val()).toBe('github-client-id');
    expect(secrets('#clientId').closest('.col-md-6').length).toBe(1);
    expect(secrets('#clientSecret').length).toBe(1);
    expect(secrets('#clientSecret').closest('.col-md-6').length).toBe(1);
    expect(secrets('#clientId').is('[data-provider-client-id]')).toBe(true);
    expect(secrets('#clientSecret').is('[data-provider-client-secret]')).toBe(true);
    expect(secrets('[data-provider-secret-display]').text()).toContain('Secret stored securely');
    expect(secrets('[data-provider-change-credentials]').length).toBe(1);
    expect(secrets('[data-provider-credentials-verified-indicator]').text()).toContain('Yes');
    expect(secrets('#clientId').is('[readonly]')).toBe(true);
    expect(secrets('[data-provider-secrets-help="github"]').text()).toContain(
      'GitHub OAuth App credentials',
    );
  });

  it('shows stored-but-unverified credentials and allows testing them without re-entering the secret', async () => {
    const locals = {
      item: {
        id: 'facebook-record',
        provider: 'github',
        callbackPath: '/auth/github/callback',
        clientId: 'stored-client-id',
        hasClientSecret: true,
        credentialsVerified: false,
        credentialsVerifiedAt: null,
      },
      isNew: false,
      readOnly: false,
      credentialTest: null,
      externalAuthProviderDefinitions,
    };

    const secrets = load(await ejs.renderFile(secretsView, locals));
    expect(secrets.text()).toContain('Credentials stored, not verified');
    expect(secrets.text()).toContain('treated as not configured for sign-in');
    expect(secrets('[data-provider-credentials-verified-indicator]').text()).toContain('No');
    expect(secrets('[data-provider-test-credentials]').attr('data-provider-test-stored')).toBe('true');
    expect(secrets('[data-provider-test-credentials]').is('[disabled]')).toBe(false);
    expect(secrets('#clientId').is('[readonly]')).toBe(true);
    expect(secrets('[data-provider-secret-display]').text()).toContain('Secret stored securely');
  });

  it('renders provider-specific help for existing Microsoft records', async () => {
    const locals = {
      item: {
        provider: 'microsoft',
        callbackPath: '/auth/microsoft/callback',
        tenant: 'common',
        hasClientSecret: true,
        credentialsVerified: true,
        credentialsVerifiedAt: '2026-08-27T12:00:00.000Z',
      },
      isNew: false,
      readOnly: true,
      credentialTest: null,
      externalAuthProviderDefinitions,
    };

    const general = load(await ejs.renderFile(generalView, locals));
    const secrets = load(await ejs.renderFile(secretsView, locals));

    expect(general('#tenant').closest('.col-md-6').length).toBe(1);
    expect(general('#enabled').closest('.col-md-6').length).toBe(1);
    expect(general('[data-provider-general-help="microsoft"]').text()).toContain(
      'Microsoft setup help',
    );
    expect(secrets('[data-provider-secrets-help="microsoft"]').text()).toContain(
      'Application (client) ID',
    );
    expect(secrets('[data-provider-secrets-help="microsoft"]').text()).toContain(
      'Secret ID is not the client secret',
    );
  });
  it('renders a verified pending credential pair as locked until Save', async () => {
    const locals = {
      item: { provider: 'github', enabled: true, callbackPath: '/auth/github/callback' },
      isNew: true,
      readOnly: false,
      credentialTest: {
        provider: 'github', enabled: true, clientId: 'tested-client', status: 'verified',
        verifiedAt: '2026-08-27T12:00:00.000Z', hasPendingSecret: true,
      },
      externalAuthProviderDefinitions,
    };
    const secrets = load(await ejs.renderFile(secretsView, locals));
    expect(secrets('#clientId').val()).toBe('tested-client');
    expect(secrets('#clientId').is('[readonly]')).toBe(true);
    expect(secrets('[data-provider-pending-credential-save]').val()).toBe('true');
    expect(secrets('[data-provider-secret-display]').text()).toContain('ready to save');
  });

});
