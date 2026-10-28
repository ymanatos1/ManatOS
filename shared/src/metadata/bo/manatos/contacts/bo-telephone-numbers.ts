import type { SysTelephoneNumber } from '../../../../domain/entities.js';
import type { SysBOMetadata } from '../../types.js';
import { commonSysBOFields } from '../../common.js';

export const sysBOTelephoneNumbersMetadata: SysBOMetadata<SysTelephoneNumber> = {
  key: 'sys-telephone-numbers',
  name: 'sysTelephoneNumbers',
  subsystem: 'contacts',
  exposure: 'internal',
  label: '@EN.manatos.auth.users.label.TelephoneNumber' /* Telephone number */,
  pluralLabel:
    '@EN.manatos.contacts.telephoneNumbers.pluralLabel.TelephoneNumbers' /* Telephone numbers */,
  primaryField: 'fullNumber',
  entry: { name: { field: 'fullNumber' } },
  fieldDefinition: {
    ...commonSysBOFields,
    name: {
      ...commonSysBOFields.name!,
      label:
        '@EN.manatos.contacts.telephoneNumbers.label.CanonicalTelephoneKey' /* Canonical telephone key */,
      readOnly: true,
    },
    countryCode: {
      key: 'countryCode',
      label: '@EN.manatos.contacts.telephoneNumbers.label.CountryCode' /* Country code */,
      type: 'string',
      order: 20,
      required: true,
      maxLength: 5,
    },
    number: {
      key: 'number',
      label: '@EN.manatos.auth.users.label.TelephoneNumber' /* Telephone number */,
      type: 'string',
      order: 30,
      required: true,
      maxLength: 40,
    },
    fullNumber: {
      key: 'fullNumber',
      label: '@EN.manatos.contacts.telephoneNumbers.label.FullNumber' /* Full number */,
      type: 'telephone',
      order: 40,
      required: true,
      readOnly: true,
      unique: true,
      calculation: {
        expression: 'TelephoneNbr(countryCode, number)',
        persisted: true,
      },
    },
  },
};

// ============================================================================
// SYS PRINCIPAL ↔ TELEPHONE NUMBERS
// ============================================================================
/** Many-to-many junction between Principals and canonical telephone rows. */
