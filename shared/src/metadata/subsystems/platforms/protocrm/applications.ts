import type { ManatOSSubsystemMetadata } from '../../types.js';

export const PROTOCRM_APPLICATIONS_SUBSYSTEM = {
  key: 'applications',
  name: 'applications',
  label: 'Applications',
  description: 'protoCRM application definitions and application-design capabilities.',
  owner: { kind: 'platform', platformId: 'protocrm' },
} as const satisfies ManatOSSubsystemMetadata;
