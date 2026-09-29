import type { SysPrincipalAddress } from '../../../domain/entities.js';
import type { SysBOMetadata } from '../types.js';
import { commonSysBOFields } from '../common.js';

export const sysBOPrincipalAddressesMetadata: SysBOMetadata<SysPrincipalAddress> = {
  key: 'sys-principal-addresses',
  name: 'sysPrincipalAddresses',
  subsystem: 'principals',
  exposure: 'internal',
  label: 'Principal address',
  pluralLabel: 'Principal addresses',
  primaryField: 'name',
  relationships: {
    principal: {
      fields: ['principalId'],
      references: { objectKey: 'sys-principals', fields: ['id'] },
      cardinality: 'many-to-one',
      policies: { delete: { action: 'cascade', confirmation: 'silent' } },
    },
    address: {
      fields: ['addressId'],
      requiredSubsystems: ['contacts'],
      references: { objectKey: 'sys-addresses', fields: ['id'] },
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
    addressId: {
      key: 'addressId',
      label: 'Address',
      type: 'reference',
      order: 30,
      required: true,
      referenceBOKey: 'sys-addresses',
    },
  },
};
