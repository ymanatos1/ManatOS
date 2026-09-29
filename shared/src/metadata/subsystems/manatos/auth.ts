import { SysBOExtAuthProviderType, SysBOUserRole } from '../../../domain/entities.js';
import type { ManatOSSubsystemMetadata } from '../types.js';

export const SYSBO_EXT_AUTH_PROVIDER_TYPE_ENUM = {
  key: 'SysBOExtAuthProviderType',
  name: 'SysBOExtAuthProviderType',
  label: 'External authentication provider type',
  values: {
    Microsoft: {
      value: SysBOExtAuthProviderType.Microsoft,
      label: 'Microsoft',
      icon: 'microsoft',
      tenant: 'common',
      callbackPath: '/auth/microsoft/callback',
    },
    Google: {
      value: SysBOExtAuthProviderType.Google,
      label: 'Google',
      icon: 'google',
      tenant: null,
      callbackPath: '/auth/google/callback',
    },
    Facebook: {
      value: SysBOExtAuthProviderType.Facebook,
      label: 'Facebook',
      icon: 'facebook',
      tenant: null,
      callbackPath: '/auth/facebook/callback',
    },
    GitHub: {
      value: SysBOExtAuthProviderType.GitHub,
      label: 'GitHub',
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
  label: 'User role',
  values: {
    Admin: { value: SysBOUserRole.Admin, label: 'Admin', icon: 'shield-lock-fill' },
    Superuser: { value: SysBOUserRole.Superuser, label: 'Superuser', icon: 'shield-check' },
    User: { value: SysBOUserRole.User, label: 'User', icon: 'person-fill' },
    Guest: { value: SysBOUserRole.Guest, label: 'Guest', icon: 'person' },
  },
} as const;

export const AUTH_SUBSYSTEM = {
  key: 'auth',
  name: 'auth',
  label: 'Auth',
  description: 'Authentication, users, invitations and external identities/providers.',
  owner: { kind: 'manatos' },
  enums: {
    [SYSBO_USER_ROLE_ENUM.key]: SYSBO_USER_ROLE_ENUM,
    [SYSBO_EXT_AUTH_PROVIDER_TYPE_ENUM.key]: SYSBO_EXT_AUTH_PROVIDER_TYPE_ENUM,
  },
} as const satisfies ManatOSSubsystemMetadata;
