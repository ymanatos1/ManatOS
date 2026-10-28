import type { SysAddress } from '../../../../domain/entities.js';
import type { SysBOMetadata } from '../../types.js';
import { commonSysBOFields } from '../../common.js';

export const sysBOAddressesMetadata: SysBOMetadata<SysAddress> = {
  key: 'sys-addresses',
  name: 'sysAddresses',
  subsystem: 'contacts',
  exposure: 'internal',
  label: '@EN.manatos.contacts.addresses.label.Address' /* Address */,
  pluralLabel: '@EN.manatos.contacts.addresses.pluralLabel.Addresses' /* Addresses */,
  primaryField: 'formattedAddress',
  entry: { name: { field: 'formattedAddress' } },
  fieldDefinition: {
    ...commonSysBOFields,
    name: {
      ...commonSysBOFields.name!,
      label: '@EN.manatos.contacts.addresses.label.CanonicalAddressKey' /* Canonical address key */,
      readOnly: true,
    },
    recipientOrAttention: {
      key: 'recipientOrAttention',
      label: '@EN.manatos.contacts.addresses.label.RecipientAttention' /* Recipient / attention */,
      type: 'string',
      order: 20,
      maxLength: 160,
    },
    organization: {
      key: 'organization',
      label: '@EN.manatos.contacts.addresses.label.Organization' /* Organization */,
      type: 'string',
      order: 30,
      maxLength: 180,
    },
    addressLine1: {
      key: 'addressLine1',
      label: '@EN.manatos.contacts.addresses.label.AddressLine1' /* Address line 1 */,
      type: 'string',
      order: 40,
      required: true,
      maxLength: 200,
    },
    addressLine2: {
      key: 'addressLine2',
      label: '@EN.manatos.contacts.addresses.label.AddressLine2' /* Address line 2 */,
      type: 'string',
      order: 50,
      maxLength: 200,
    },
    addressLine3: {
      key: 'addressLine3',
      label: '@EN.manatos.contacts.addresses.label.AddressLine3' /* Address line 3 */,
      type: 'string',
      order: 60,
      maxLength: 200,
    },
    poBox: {
      key: 'poBox',
      label: '@EN.manatos.contacts.addresses.label.POBox' /* PO Box */,
      type: 'string',
      order: 70,
      maxLength: 80,
    },
    postalCode: {
      key: 'postalCode',
      label: '@EN.manatos.contacts.addresses.label.PostalCode' /* Postal code */,
      type: 'string',
      order: 80,
      maxLength: 40,
    },
    city: {
      key: 'city',
      label: '@EN.manatos.contacts.addresses.label.City' /* City */,
      type: 'string',
      order: 90,
      required: true,
      maxLength: 120,
    },
    stateOrProvince: {
      key: 'stateOrProvince',
      label: '@EN.manatos.contacts.addresses.label.StateProvince' /* State / province */,
      type: 'string',
      order: 100,
      maxLength: 120,
    },
    country: {
      key: 'country',
      label: '@EN.manatos.contacts.addresses.label.Country' /* Country */,
      type: 'string',
      order: 110,
      required: true,
      maxLength: 120,
    },
    formattedAddress: {
      key: 'formattedAddress',
      label: '@EN.manatos.contacts.addresses.label.FormattedAddress' /* Formatted address */,
      type: 'string',
      order: 120,
      required: true,
      readOnly: true,
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
