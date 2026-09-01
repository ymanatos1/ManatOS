import { SysBOExtAuthProviderType } from '@manatos/shared';

/**
 * API-owned definition of one supported external authentication provider.
 *
 * These values describe the third-party provider itself rather than one
 * persisted SysBOExtAuthProvider record. Keeping the catalogue on the API side
 * gives ManatOS one authoritative source for defaults, OAuth scopes and Admin
 * setup guidance. The user-facing strings can later become localization keys
 * without changing persisted provider records.
 */
export interface ExternalAuthProviderDefinition {
  provider: SysBOExtAuthProviderType;
  label: string;
  icon: string;
  scope: string[];
  callbackPath: string;
  tenant?: string;
  generalHelp: {
    title: string;
    steps: string[];
    configuredRule: string;
  };
  secretsHelp: {
    title: string;
    introduction: string;
    sections: Array<{ title: string; steps: string[] }>;
    warning?: string;
  };
}

export const externalAuthProviderDefinitions: Record<
  SysBOExtAuthProviderType,
  ExternalAuthProviderDefinition
> = {
  [SysBOExtAuthProviderType.Microsoft]: {
    provider: SysBOExtAuthProviderType.Microsoft,
    label: 'Microsoft',
    icon: 'bi-microsoft',
    scope: ['openid', 'profile', 'email', 'User.Read'],
    callbackPath: '/auth/microsoft/callback',
    tenant: 'common',
    generalHelp: {
      title: 'Microsoft setup help',
      steps: [
        'Open Microsoft Entra admin center and go to App registrations.',
        'Create or select the application registration used by ManatOS.',
        'Under Authentication, add a Web redirect URI using the ManatOS public base URL plus /auth/microsoft/callback.',
        "ManatOS currently uses the Microsoft tenant value 'common' so accounts from supported Microsoft identity types can authenticate.",
      ],
      configuredRule:
        'Microsoft is available to users only when the provider is enabled and its Client ID + Client secret pair has passed the ManatOS credential test.',
    },
    secretsHelp: {
      title: 'Microsoft application credentials',
      introduction:
        'Create the OAuth application credentials in the same Microsoft Entra app registration used for the callback configuration.',
      sections: [
        {
          title: 'Client ID',
          steps: [
        'Open Microsoft Entra admin center → App registrations → your ManatOS application.',
        'On Overview, copy Application (client) ID into Client ID below.',
        'Do not use the Object ID or Directory (tenant) ID as the Client ID.',
          ],
        },
        {
          title: 'Client secret',
          steps: [
        'Open Certificates & secrets → Client secrets and choose New client secret.',
        'Choose an appropriate description and expiry, then create the secret.',
        'Copy the secret Value into Client secret below. The Secret ID is not the client secret.',
          ],
        },
      ],
      warning:
        'Microsoft displays the client-secret Value only when it is created. Store it in ManatOS before leaving the page, and plan to replace it before its configured expiry.',
    },
  },

  [SysBOExtAuthProviderType.Google]: {
    provider: SysBOExtAuthProviderType.Google,
    label: 'Google',
    icon: 'bi-google',
    scope: ['profile', 'email'],
    callbackPath: '/auth/google/callback',
    generalHelp: {
      title: 'Google setup help',
      steps: [
        'Open Google Cloud Console and select the project that will own the ManatOS OAuth client.',
        'Configure the OAuth consent screen as required for your intended users.',
        'Create a Web application OAuth client and add the ManatOS public base URL plus /auth/google/callback as an Authorized redirect URI.',
      ],
      configuredRule:
        'Google is available to users only when the provider is enabled and its Client ID + Client secret pair has passed the ManatOS credential test.',
    },
    secretsHelp: {
      title: 'Google OAuth client credentials',
      introduction:
        'Use the Web application OAuth 2.0 client created for ManatOS in Google Cloud Console.',
      sections: [
        {
          title: 'Client ID',
          steps: [
        'Open Google Cloud Console → APIs & Services → Credentials.',
        'Open the OAuth 2.0 Client ID created for ManatOS.',
        'Copy its Client ID into Client ID below.',
          ],
        },
        {
          title: 'Client secret',
          steps: [
        'From the same OAuth client, copy the Client secret into Client secret below.',
        'If Google requires a new credential, create/rotate the OAuth client secret in the provider console and save the replacement here.',
          ],
        },
      ],
      warning:
        'Treat the Google Client secret as a credential. Never commit it to source control or place it in browser-side code.',
    },
  },

  [SysBOExtAuthProviderType.Facebook]: {
    provider: SysBOExtAuthProviderType.Facebook,
    label: 'Facebook',
    icon: 'bi-facebook',
    scope: ['email'],
    callbackPath: '/auth/facebook/callback',
    generalHelp: {
      title: 'Facebook setup help',
      steps: [
        'Open Meta for Developers and create or select the app used by ManatOS.',
        'Configure Facebook Login for the application.',
        'Add the ManatOS public base URL plus /auth/facebook/callback to the valid OAuth redirect URIs.',
      ],
      configuredRule:
        'Facebook is available to users only when the provider is enabled and its Client ID + Client secret pair has passed the ManatOS credential test.',
    },
    secretsHelp: {
      title: 'Facebook application credentials',
      introduction: 'Use the Meta application configured for ManatOS Facebook Login.',
      sections: [
        {
          title: 'Client ID',
          steps: [
        'Open Meta for Developers → your application → App settings → Basic.',
        'Copy the App ID into Client ID below.',
          ],
        },
        {
          title: 'Client secret',
          steps: [
        'On the same App settings → Basic page, reveal the App secret when permitted.',
        'Copy the App secret into Client secret below.',
          ],
        },
      ],
      warning:
        'The Facebook App secret grants privileged access to the application configuration. Keep it server-side and rotate it if it is ever exposed.',
    },
  },

  [SysBOExtAuthProviderType.GitHub]: {
    provider: SysBOExtAuthProviderType.GitHub,
    label: 'GitHub',
    icon: 'bi-github',
    scope: ['read:user', 'user:email'],
    callbackPath: '/auth/github/callback',
    generalHelp: {
      title: 'GitHub setup help',
      steps: [
        'Open GitHub Settings → Developer settings → OAuth Apps.',
        'Create or select the OAuth App used by ManatOS.',
        'Set its Authorization callback URL to the ManatOS public base URL plus /auth/github/callback.',
      ],
      configuredRule:
        'GitHub is available to users only when the provider is enabled and its Client ID + Client secret pair has passed the ManatOS credential test.',
    },
    secretsHelp: {
      title: 'GitHub OAuth App credentials',
      introduction: 'Use the GitHub OAuth App configured with the ManatOS callback URL.',
      sections: [
        {
          title: 'Client ID',
          steps: [
        'Open GitHub Settings → Developer settings → OAuth Apps → your ManatOS OAuth App.',
        'Copy Client ID into Client ID below.',
          ],
        },
        {
          title: 'Client secret',
          steps: [
        'In the same OAuth App, generate a new client secret when one is required.',
        'Copy the generated client-secret value into Client secret below.',
          ],
        },
      ],
      warning:
        'A newly generated GitHub client secret may not remain visible indefinitely. Save it in ManatOS when generated and revoke superseded secrets after confirming the replacement works.',
    },
  },
};

export function externalAuthProviderDefinitionFor(
  provider: string | null | undefined,
): ExternalAuthProviderDefinition {
  const normalized = String(provider ?? '').trim().toLowerCase() as SysBOExtAuthProviderType;

  return (
    externalAuthProviderDefinitions[normalized] ??
    externalAuthProviderDefinitions[SysBOExtAuthProviderType.Microsoft]!
  );
}
