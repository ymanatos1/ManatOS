import type { SysPrincipalAddress } from '../../../../domain/entities.js';
import type { SysBOMetadata } from '../../types.js';
import { commonSysBOFields } from '../../common.js';

export const sysBOPrincipalAddressesMetadata: SysBOMetadata<SysPrincipalAddress> = {
  key: 'sys-principal-addresses',
  name: 'sysPrincipalAddresses',
  subsystem: 'principals',
  exposure: 'internal',
  label: '@EN.manatos.principals.principalAddresses.label.PrincipalAddress' /* Principal address */,
  pluralLabel:
    '@EN.manatos.principals.principalAddresses.pluralLabel.PrincipalAddresses' /* Principal addresses */,
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
      label:
        '@EN.manatos.principals.principalAddresses.label.RelationshipKey' /* Relationship key */,
      readOnly: true,
    },
    principalId: {
      key: 'principalId',
      label: '@EN.manatos.auth.userInvitations.label.Principal' /* Principal */,
      type: 'reference',
      order: 20,
      required: true,
    },
    addressId: {
      key: 'addressId',
      label: '@EN.manatos.contacts.addresses.label.Address' /* Address */,
      type: 'reference',
      order: 30,
      required: true,
    },
  },
};
