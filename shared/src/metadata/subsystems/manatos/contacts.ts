import type { ManatOSSubsystemMetadata } from '../types.js';

export const CONTACTS_SUBSYSTEM = {
  key: 'contacts',
  name: 'contacts',
  label: '@SS.manatos.contacts.label.Contacts' /* Contacts */,
  description:
    '@SS.manatos.contacts.description.ReusableEmailaddressTelephonenumberAndPostaladdressEntities' /* Reusable email-address, telephone-number and postal-address entities. */,
  owner: { kind: 'manatos' },
} as const satisfies ManatOSSubsystemMetadata;
