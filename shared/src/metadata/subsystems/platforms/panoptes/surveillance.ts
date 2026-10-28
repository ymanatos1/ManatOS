import type { ManatOSSubsystemMetadata } from '../../types.js';

/** Canonical subsystem contributed exclusively by the Panoptes platform. */
export const PANOPTES_SURVEILLANCE_SUBSYSTEM = {
  key: 'surveillance',
  name: 'surveillance',
  label: '@SS.platforms.panoptes.surveillance.label.Surveillance' /* Surveillance */,
  description:
    '@SS.platforms.panoptes.surveillance.description.SurveillanceOperations' /* Panoptes surveillance operations and their guard, project and post entities. */,
  owner: { kind: 'platform', platformId: 'panoptes' },
} as const satisfies ManatOSSubsystemMetadata;
