import type { ManatOSSubsystemMetadata } from '../../types.js';

export const PROTOCRM_APPLICATIONS_SUBSYSTEM = {
  key: 'applications',
  name: 'applications',
  label: '@SS.platforms.protocrm.applications.label.Applications' /* Applications */,
  description:
    '@SS.platforms.protocrm.applications.description.ProtoCRMApplicationDefinitionsAndApplicationdesignCapabilities' /* protoCRM application definitions and application-design capabilities. */,
  owner: { kind: 'platform', platformId: 'protocrm' },
} as const satisfies ManatOSSubsystemMetadata;
