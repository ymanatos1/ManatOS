import type { ManatOSSubsystemMetadata } from '../types.js';

export const AUTH_SUBSYSTEM = {
  key: 'auth',
  name: 'auth',
  label: 'Auth',
  description: 'Authentication, users, invitations and external identities/providers.',
  owner: { kind: 'manatos' },
} as const satisfies ManatOSSubsystemMetadata;
