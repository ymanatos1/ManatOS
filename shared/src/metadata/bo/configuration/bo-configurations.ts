import type { SysBOConfiguration } from '../../../domain/entities.js';
import type { SysBOMetadata } from '../types.js';
import { commonSysBOFields } from '../common.js';

export const sysBOConfigurationsMetadata: SysBOMetadata<SysBOConfiguration> = {
  key: 'sys-configurations',
  name: 'sysConfigurations',
  subsystem: 'configuration',
  label: 'Configuration',
  pluralLabel: 'Configurations',
  primaryField: 'name',
  // Canonical fields
  fieldDefinition: {
    ...commonSysBOFields,
    name: {
      ...commonSysBOFields.name!,
      label: 'Setting',
      readOnly: true,
    },
    value: {
      key: 'value',
      label: 'Value',
      type: 'string',
      order: 20,

      nullable: true,
    },
    valueEncrypted: {
      key: 'valueEncrypted',
      label: 'Encrypted value',
      type: 'string',
      order: 21,

      sensitive: true,
      readOnly: true,
      nullable: true,
    },
    group: {
      key: 'group',
      label: 'Group',
      type: 'string',
      order: 30,

      readOnly: true,
    },
    description: {
      key: 'description',
      label: 'Help',
      type: 'string',
      order: 40,

      readOnly: true,
    },
    valueType: {
      key: 'valueType',
      label: 'Type',
      type: 'string',
      order: 50,

      readOnly: true,
    },
    allowedValues: {
      key: 'allowedValues',
      label: 'Allowed values',
      type: 'string',
      order: 60,

      readOnly: true,
      nullable: true,
    },
    defaultValue: {
      key: 'defaultValue',
      label: 'Default',
      type: 'string',
      order: 70,

      readOnly: true,
      nullable: true,
    },
    restartRequired: {
      key: 'restartRequired',
      label: 'Restart required',
      type: 'boolean',
      order: 80,

      readOnly: true,
    },
    editable: {
      key: 'editable',
      label: 'Editable',
      type: 'boolean',
      order: 90,

      readOnly: true,
    },
    sensitive: {
      key: 'sensitive',
      label: 'Sensitive',
      type: 'boolean',
      order: 100,

      readOnly: true,
    },
  },
};
