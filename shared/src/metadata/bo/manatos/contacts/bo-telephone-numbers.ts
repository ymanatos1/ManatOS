import type { SysTelephoneNumber } from '../../../../domain/entities.js';
import type { SysBOMetadata } from '../../types.js';
import { commonSysBOFields } from '../../common.js';

export const sysBOTelephoneNumbersMetadata: SysBOMetadata<SysTelephoneNumber> = {
  key: 'sys-telephone-numbers',
  name: 'sysTelephoneNumbers',
  subsystem: 'contacts',
  exposure: 'internal',
  label: 'Telephone number',
  pluralLabel: 'Telephone numbers',
  primaryField: 'fullNumber',
  entry: { name: { field: 'fullNumber' } },
  fieldDefinition: {
    ...commonSysBOFields,
    name: {
      ...commonSysBOFields.name!,
      label: 'Canonical telephone key',
      readOnly: true,
    },
    countryCode: {
      key: 'countryCode',
      label: 'Country code',
      type: 'string',
      order: 20,
      required: true,
      maxLength: 5,
    },
    number: {
      key: 'number',
      label: 'Telephone number',
      type: 'string',
      order: 30,
      required: true,
      maxLength: 40,
    },
    fullNumber: {
      key: 'fullNumber',
      label: 'Full number',
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
