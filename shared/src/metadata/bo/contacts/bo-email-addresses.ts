import type { SysEmailAddress } from '../../../domain/entities.js';
import type { SysBOMetadata } from '../types.js';
import { commonSysBOFields } from '../common.js';

export const sysBOEmailAddressesMetadata: SysBOMetadata<SysEmailAddress> = {
  key: 'sys-email-addresses',
  name: 'sysEmailAddresses',
  subsystem: 'contacts',
  exposure: 'internal',
  label: 'Email address',
  pluralLabel: 'Email addresses',
  primaryField: 'address',
  entry: { name: { field: 'address' } },
  fieldDefinition: {
    ...commonSysBOFields,
    name: {
      ...commonSysBOFields.name!,
      label: 'Canonical email key',
      readOnly: true,
    },
    address: {
      key: 'address',
      label: 'Email address',
      type: 'email',
      order: 20,
      required: true,
      unique: true,
      maxLength: 254,
      normalize: { expression: 'EmailAddress(value)' },
    },
  },
};

// ============================================================================
// SYS PRINCIPAL ↔ EMAIL ADDRESSES
// ============================================================================
/** Many-to-many junction between Principals and canonical email-address rows. */
