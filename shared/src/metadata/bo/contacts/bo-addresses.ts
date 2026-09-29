import type { SysAddress } from '../../../domain/entities.js';
import type { SysBOMetadata } from '../types.js';
import { commonSysBOFields } from '../common.js';

export const sysBOAddressesMetadata: SysBOMetadata<SysAddress> = {
  key: 'sys-addresses',
  name: 'sysAddresses',
  subsystem: 'contacts',
  exposure: 'internal',
  label: 'Address',
  pluralLabel: 'Addresses',
  primaryField: 'formattedAddress',
  entry: { name: { field: 'formattedAddress' } },
  fieldDefinition: {
    ...commonSysBOFields,
    name: {
      ...commonSysBOFields.name!,
      label: 'Canonical address key',
      readOnly: true,
    },
    recipientOrAttention: {
      key: 'recipientOrAttention',
      label: 'Recipient / attention',
      type: 'string',
      order: 20,
      maxLength: 160,
    },
    organization: {
      key: 'organization',
      label: 'Organization',
      type: 'string',
      order: 30,
      maxLength: 180,
    },
    addressLine1: {
      key: 'addressLine1',
      label: 'Address line 1',
      type: 'string',
      order: 40,
      required: true,
      maxLength: 200,
    },
    addressLine2: {
      key: 'addressLine2',
      label: 'Address line 2',
      type: 'string',
      order: 50,
      maxLength: 200,
    },
    addressLine3: {
      key: 'addressLine3',
      label: 'Address line 3',
      type: 'string',
      order: 60,
      maxLength: 200,
    },
    poBox: { key: 'poBox', label: 'PO Box', type: 'string', order: 70, maxLength: 80 },
    postalCode: {
      key: 'postalCode',
      label: 'Postal code',
      type: 'string',
      order: 80,
      maxLength: 40,
    },
    city: { key: 'city', label: 'City', type: 'string', order: 90, required: true, maxLength: 120 },
    stateOrProvince: {
      key: 'stateOrProvince',
      label: 'State / province',
      type: 'string',
      order: 100,
      maxLength: 120,
    },
    country: {
      key: 'country',
      label: 'Country',
      type: 'string',
      order: 110,
      required: true,
      maxLength: 120,
    },
    formattedAddress: {
      key: 'formattedAddress',
      label: 'Formatted address',
      type: 'string',
      order: 120,
      required: true,
      readOnly: true,
      applicationManaged: true,
      maxLength: 1000,
      calculation: {
        expression:
          "(recipientOrAttention != '' ? recipientOrAttention + ', ' : '') + " +
          "(organization != '' ? organization + ', ' : '') + addressLine1 + " +
          "(addressLine2 != '' ? ', ' + addressLine2 : '') + " +
          "(addressLine3 != '' ? ', ' + addressLine3 : '') + " +
          "(poBox != '' ? ', PO Box ' + poBox : '') + " +
          "(postalCode != '' ? ', ' + postalCode : '') + ', ' + city + " +
          "(stateOrProvince != '' ? ', ' + stateOrProvince : '') + ', ' + country",
        persisted: true,
      },
    },
  },
};

// ============================================================================
// SYS PRINCIPAL ↔ ADDRESSES
// ============================================================================
/** Many-to-many junction between Principals and canonical postal-address rows. */
