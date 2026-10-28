import type { SysBOConfiguration } from '../../../../domain/entities.js';
import type { SysBOMetadata } from '../../types.js';
import { commonSysBOFields } from '../../common.js';

export const sysBOConfigurationsMetadata: SysBOMetadata<SysBOConfiguration> = {
  key: 'sys-configurations',
  name: 'sysConfigurations',
  subsystem: 'configuration',
  label: '@EN.manatos.configuration.configurations.label.Configuration' /* Configuration */,
  pluralLabel:
    '@EN.manatos.configuration.configurations.pluralLabel.Configurations' /* Configurations */,
  primaryField: 'name',
  // Canonical fields
  fieldDefinition: {
    ...commonSysBOFields,
    name: {
      ...commonSysBOFields.name!,
      label: '@EN.manatos.configuration.configurations.label.Setting' /* Setting */,
      readOnly: true,
    },
    value: {
      key: 'value',
      label: '@EN.manatos.configuration.configurations.label.Value' /* Value */,
      type: 'string',
      order: 20,

      nullable: true,
    },
    valueEncrypted: {
      key: 'valueEncrypted',
      label: '@EN.manatos.configuration.configurations.label.EncryptedValue' /* Encrypted value */,
      type: 'string',
      order: 21,

      sensitive: true,
      readOnly: true,
      nullable: true,
    },
    group: {
      key: 'group',
      label: '@EN.manatos.configuration.configurations.label.Group' /* Group */,
      type: 'string',
      order: 30,

      readOnly: true,
    },
    description: {
      key: 'description',
      label: '@EN.manatos.configuration.configurations.label.Help' /* Help */,
      type: 'string',
      order: 40,

      readOnly: true,
    },
    valueType: {
      key: 'valueType',
      label: '@EN.manatos.configuration.configurations.label.Type' /* Type */,
      type: 'string',
      order: 50,

      readOnly: true,
    },
    allowedValues: {
      key: 'allowedValues',
      label: '@EN.manatos.configuration.configurations.label.AllowedValues' /* Allowed values */,
      type: 'string',
      order: 60,

      readOnly: true,
      nullable: true,
    },
    defaultValue: {
      key: 'defaultValue',
      label: '@EN.manatos.configuration.configurations.label.Default' /* Default */,
      type: 'string',
      order: 70,

      readOnly: true,
      nullable: true,
    },
    restartRequired: {
      key: 'restartRequired',
      label:
        '@EN.manatos.configuration.configurations.label.RestartRequired' /* Restart required */,
      type: 'boolean',
      order: 80,

      readOnly: true,
    },
    editable: {
      key: 'editable',
      label: '@EN.manatos.configuration.configurations.label.Editable' /* Editable */,
      type: 'boolean',
      order: 90,

      readOnly: true,
    },
    sensitive: {
      key: 'sensitive',
      label: '@EN.manatos.configuration.configurations.label.Sensitive' /* Sensitive */,
      type: 'boolean',
      order: 100,

      readOnly: true,
    },
  },
};
