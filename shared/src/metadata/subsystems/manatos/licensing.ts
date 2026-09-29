import type { ManatOSSubsystemMetadata } from '../types.js';

export const LICENSING_SUBSYSTEM = {
  key: 'licensing',
  name: 'licensing',
  label: 'Licensing',
  description: 'Licenses and licensing rules/capabilities.',
  owner: { kind: 'manatos' },
} as const satisfies ManatOSSubsystemMetadata;
