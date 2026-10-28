import { MANATOS_COMPANY } from '../../../domain/company-platform.js';
import { resolveMetadataText } from '../../../multilingual/metadata/index.js';
import type { ManatOSEnumMetadata, ManatOSSubsystemMetadata } from '../types.js';

export const SYS_PLATFORM_ENUM: ManatOSEnumMetadata = {
  key: 'SysPlatform',
  name: 'SysPlatform',
  label: '@SS.manatos.configuration.label.Platform' /* Platform */,
  values: Object.fromEntries(
    MANATOS_COMPANY.platforms
      .filter((platform) => platform.enabled)
      .map((platform) => [
        platform.id,
        {
          value: platform.id,
          label: {
            EN: resolveMetadataText(platform.shortName, 'EN'),
            EL: resolveMetadataText(platform.shortName, 'EL'),
          },
          ...(platform.icon ? { icon: platform.icon.replace(/^bi-/, '') } : {}),
        },
      ]),
  ),
};

export const CONFIGURATION_SUBSYSTEM = {
  key: 'configuration',
  name: 'configuration',
  label: '@SS.manatos.configuration.label.Configuration' /* Configuration */,
  description:
    '@SS.manatos.configuration.description.RuntimeApplicationConfigurationAndSystemConfiguration' /* Runtime application configuration and system configuration entities. */,
  owner: { kind: 'manatos' },
  enums: { [SYS_PLATFORM_ENUM.key]: SYS_PLATFORM_ENUM },
} as const satisfies ManatOSSubsystemMetadata;
