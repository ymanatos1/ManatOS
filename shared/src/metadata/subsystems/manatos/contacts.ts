import type { ManatOSSubsystemMetadata } from '../types.js';

export const CONTACTS_SUBSYSTEM = {
  key: 'contacts',
  name: 'contacts',
  label: 'Contacts',
  description: 'Reusable email-address, telephone-number and postal-address entities.',
  owner: { kind: 'manatos' },
} as const satisfies ManatOSSubsystemMetadata;
