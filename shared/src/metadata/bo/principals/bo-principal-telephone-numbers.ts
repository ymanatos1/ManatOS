import type { SysPrincipalTelephoneNumber } from '../../../domain/entities.js';
import type { SysBOMetadata } from '../types.js';
import { commonSysBOFields } from '../common.js';

export const sysBOPrincipalTelephoneNumbersMetadata: SysBOMetadata<SysPrincipalTelephoneNumber> = {
  key: 'sys-principal-telephone-numbers',
  name: 'sysPrincipalTelephoneNumbers',
  subsystem: 'principals',
  exposure: 'internal',
  label: 'Principal telephone number',
  pluralLabel: 'Principal telephone numbers',
  primaryField: 'name',
  relationships: {
    principal: {
      fields: ['principalId'],
      references: { objectKey: 'sys-principals', fields: ['id'] },
      cardinality: 'many-to-one',
      policies: { delete: { action: 'cascade', confirmation: 'silent' } },
    },
    telephoneNumber: {
      fields: ['telephoneNumberId'],
      requiredSubsystems: ['contacts'],
      references: { objectKey: 'sys-telephone-numbers', fields: ['id'] },
      cardinality: 'many-to-one',
      policies: { delete: { action: 'restrict', confirmation: 'confirm' } },
    },
  },
  fieldDefinition: {
    ...commonSysBOFields,
    name: {
      ...commonSysBOFields.name!,
      label: 'Relationship key',
      readOnly: true,
    },
    principalId: {
      key: 'principalId',
      label: 'Principal',
      type: 'reference',
      order: 20,
      required: true,
      referenceBOKey: 'sys-principals',
    },
    telephoneNumberId: {
      key: 'telephoneNumberId',
      label: 'Telephone number',
      type: 'reference',
      order: 30,
      required: true,
      referenceBOKey: 'sys-telephone-numbers',
    },
  },
};

/**
 * Postal/street addresses are internal reusable contact entities. Their
 * constituent fields are authoritative; formattedAddress is a persisted
 * calculated field so every client receives the same compact description.
 */
// ============================================================================
// SYS ADDRESSES
// ============================================================================
