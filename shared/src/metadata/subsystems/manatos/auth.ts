import { SysBOExtAuthProviderType, SysBOUserRole } from '../../../domain/entities.js';
import type { ManatOSSubsystemMetadata } from '../types.js';

export const SYSBO_EXT_AUTH_PROVIDER_TYPE_ENUM = {
  key: 'SysBOExtAuthProviderType',
  name: 'SysBOExtAuthProviderType',
  label:
    '@SS.manatos.auth.label.ExternalAuthenticationProviderType' /* External authentication provider type */,
  values: {
    Microsoft: {
      value: SysBOExtAuthProviderType.Microsoft,
      label: { EN: 'Microsoft', EL: 'Microsoft' },
      icon: 'microsoft',
      tenant: 'common',
      callbackPath: '/auth/microsoft/callback',
    },
    Google: {
      value: SysBOExtAuthProviderType.Google,
      label: { EN: 'Google', EL: 'Google' },
      icon: 'google',
      tenant: null,
      callbackPath: '/auth/google/callback',
    },
    Facebook: {
      value: SysBOExtAuthProviderType.Facebook,
      label: { EN: 'Facebook', EL: 'Facebook' },
      icon: 'facebook',
      tenant: null,
      callbackPath: '/auth/facebook/callback',
    },
    GitHub: {
      value: SysBOExtAuthProviderType.GitHub,
      label: { EN: 'GitHub', EL: 'GitHub' },
      icon: 'github',
      tenant: null,
      callbackPath: '/auth/github/callback',
    },
  },
} as const;

/** Known-provider presentation catalogue derived from the canonical auth enum. */
export const externalAuthProviderOptionItems = Object.freeze(
  Object.values(SYSBO_EXT_AUTH_PROVIDER_TYPE_ENUM.values),
);

export const SYSBO_USER_ROLE_ENUM = {
  key: 'SysBOUserRole',
  name: 'SysBOUserRole',
  label: '@SS.manatos.auth.label.UserRole' /* User role */,
  values: {
    Admin: {
      value: SysBOUserRole.Admin,
      label: { EN: 'Admin', EL: 'Διαχειριστής' },
      icon: 'shield-lock-fill',
    },
    Superuser: {
      value: SysBOUserRole.Superuser,
      label: { EN: 'Superuser', EL: 'Υπερχρήστης' },
      icon: 'shield-check',
    },
    User: { value: SysBOUserRole.User, label: { EN: 'User', EL: 'Χρήστης' }, icon: 'person-fill' },
    Guest: { value: SysBOUserRole.Guest, label: { EN: 'Guest', EL: 'Επισκέπτης' }, icon: 'person' },
  },
} as const;

export const AUTH_SUBSYSTEM = {
  key: 'auth',
  name: 'auth',
  label: '@SS.manatos.auth.label.Auth' /* Auth */,
  description:
    '@SS.manatos.auth.description.AuthenticationUsersInvitationsAndExternalIdentitiesproviders' /* Authentication, users, invitations and external identities/providers. */,
  owner: { kind: 'manatos' },
  enums: {
    [SYSBO_USER_ROLE_ENUM.key]: SYSBO_USER_ROLE_ENUM,
    [SYSBO_EXT_AUTH_PROVIDER_TYPE_ENUM.key]: SYSBO_EXT_AUTH_PROVIDER_TYPE_ENUM,
  },
} as const satisfies ManatOSSubsystemMetadata;
