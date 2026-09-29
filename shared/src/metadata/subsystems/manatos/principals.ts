import type { ManatOSSubsystemMetadata } from '../types.js';

export const PRINCIPALS_SUBSYSTEM = {
  key: 'principals',
  name: 'principals',
  label: 'Principals',
  description: 'Reusable people, organizations, groups and other business/security principals.',
  owner: { kind: 'manatos' },
} as const satisfies ManatOSSubsystemMetadata;
