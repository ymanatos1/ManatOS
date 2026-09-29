import { MANATOS_COMPANY } from '../../../domain/company-platform.js';
import type { ManatOSEnumMetadata, ManatOSSubsystemMetadata } from '../types.js';

export const SYS_PLATFORM_ENUM: ManatOSEnumMetadata = {
  key: 'SysPlatform',
  name: 'SysPlatform',
  label: 'Platform',
  values: Object.fromEntries(
    MANATOS_COMPANY.platforms
      .filter((platform) => platform.enabled)
      .map((platform) => [
        platform.id,
        {
          value: platform.id,
          label: platform.shortName,
          ...(platform.icon ? { icon: platform.icon.replace(/^bi-/, '') } : {}),
        },
      ]),
  ),
};

export const CONFIGURATION_SUBSYSTEM = {
  key: 'configuration',
  name: 'configuration',
  label: 'Configuration',
  description: 'Runtime application configuration and system configuration entities.',
  owner: { kind: 'manatos' },
  enums: { [SYS_PLATFORM_ENUM.key]: SYS_PLATFORM_ENUM },
} as const satisfies ManatOSSubsystemMetadata;
