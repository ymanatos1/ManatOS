import type { ManatOSSubsystemMetadata } from '../types.js';

export const CONFIGURATION_SUBSYSTEM = {
  key: 'configuration',
  name: 'configuration',
  label: 'Configuration',
  description: 'Runtime application configuration and system configuration entities.',
  owner: { kind: 'manatos' },
} as const satisfies ManatOSSubsystemMetadata;
