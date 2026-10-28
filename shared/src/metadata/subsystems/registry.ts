import type { CompanyInfo, SysPlatform } from '../../platforms/types.js';
import { allManatOSObjectMetadata, allSysBOMetadata } from '../bo/registry.js';
import { AUTH_SUBSYSTEM } from './manatos/auth.js';
import { CONFIGURATION_SUBSYSTEM } from './manatos/configuration.js';
import { CONTACTS_SUBSYSTEM } from './manatos/contacts.js';
import { LICENSING_SUBSYSTEM } from './manatos/licensing.js';
import { PRINCIPALS_SUBSYSTEM } from './manatos/principals.js';
import { PROTOCRM_APPLICATIONS_SUBSYSTEM } from './platforms/protocrm/applications.js';
import { PANOPTES_SURVEILLANCE_SUBSYSTEM } from './platforms/panoptes/surveillance.js';
import type { ManatOSSubsystemMetadata } from './types.js';

export const allManatOSSubsystemMetadata = {
  [AUTH_SUBSYSTEM.key]: AUTH_SUBSYSTEM,
  [CONTACTS_SUBSYSTEM.key]: CONTACTS_SUBSYSTEM,
  [PRINCIPALS_SUBSYSTEM.key]: PRINCIPALS_SUBSYSTEM,
  [LICENSING_SUBSYSTEM.key]: LICENSING_SUBSYSTEM,
  [CONFIGURATION_SUBSYSTEM.key]: CONFIGURATION_SUBSYSTEM,
  [PROTOCRM_APPLICATIONS_SUBSYSTEM.key]: PROTOCRM_APPLICATIONS_SUBSYSTEM,
  [PANOPTES_SURVEILLANCE_SUBSYSTEM.key]: PANOPTES_SURVEILLANCE_SUBSYSTEM,
} as const satisfies Readonly<Record<string, ManatOSSubsystemMetadata>>;

export type ManatOSSubsystemKey = keyof typeof allManatOSSubsystemMetadata;

function subsystemMetadataValues(): readonly ManatOSSubsystemMetadata[] {
  return Object.values(allManatOSSubsystemMetadata) as readonly ManatOSSubsystemMetadata[];
}

export function effectiveEnumKeys(company: CompanyInfo, platform: SysPlatform | null): Set<string> {
  const selected = selectedSubsystemKeys(company, platform);
  return new Set(
    subsystemMetadataValues()
      .filter((subsystem) => selected.has(subsystem.key))
      .flatMap((subsystem) => Object.keys(subsystem.enums ?? {})),
  );
}

function isCompanySubsystem(key: string): boolean {
  const subsystem = allManatOSSubsystemMetadata[key as ManatOSSubsystemKey];
  return subsystem?.owner.kind === 'manatos';
}

function isPlatformSubsystem(key: string, platform: SysPlatform): boolean {
  const subsystem = allManatOSSubsystemMetadata[key as ManatOSSubsystemKey];
  return subsystem?.owner.kind === 'platform' && subsystem.owner.platformId === platform.id;
}

export function selectedSubsystemKeys(
  company: CompanyInfo,
  platform: SysPlatform | null,
): Set<string> {
  return new Set([
    ...company.subsystems
      .filter((entry) => entry.selected && isCompanySubsystem(entry.key))
      .map((entry) => entry.key),
    ...(platform?.subsystems ?? [])
      .filter((entry) => entry.selected && isPlatformSubsystem(entry.key, platform!))
      .map((entry) => entry.key),
  ]);
}

function objectRequiredSubsystems(
  metadata: (typeof allManatOSObjectMetadata)[keyof typeof allManatOSObjectMetadata],
) {
  return new Set(
    Object.values(metadata.relationships ?? {}).flatMap((relationship) =>
      relationship.requiredSubsystems ? [...relationship.requiredSubsystems] : [],
    ),
  );
}

/** Effective entity/object keys are derived from canonical subsystem ownership and dependencies. */
export function effectiveObjectKeys(
  company: CompanyInfo,
  platform: SysPlatform | null,
): Set<string> {
  const selected = selectedSubsystemKeys(company, platform);
  return new Set(
    Object.values(allManatOSObjectMetadata)
      .filter(
        (metadata) =>
          selected.has(metadata.subsystem) &&
          [...objectRequiredSubsystems(metadata)].every((required) => selected.has(required)),
      )
      .map((metadata) => metadata.key),
  );
}

/** First-class CRUD entity keys available for the selected subsystem composition. */
export function effectiveEntityKeys(
  company: CompanyInfo,
  platform: SysPlatform | null,
): Set<string> {
  const objects = effectiveObjectKeys(company, platform);
  return new Set(
    Object.values(allSysBOMetadata)
      .filter((metadata) => objects.has(metadata.key) && metadata.exposure !== 'internal')
      .map((metadata) => metadata.key),
  );
}

export type ManatOSSubsystemContextProjection = Omit<ManatOSSubsystemMetadata, 'enums'> &
  Readonly<{
    selected: boolean;
    entities: readonly string[];
    /** Canonical enum keys contributed by this subsystem. */
    enums: readonly string[];
  }>;

/** CTX-visible catalogue: ManatOS subsystems plus the selected platform's subsystems. */
export function subsystemContextCatalogue(
  company: CompanyInfo,
  platform: SysPlatform | null,
): Readonly<Record<string, ManatOSSubsystemContextProjection>> {
  const companyKeys = new Set(
    company.subsystems.filter((entry) => isCompanySubsystem(entry.key)).map((entry) => entry.key),
  );
  const platformKeys = new Set(
    (platform?.subsystems ?? [])
      .filter((entry) => isPlatformSubsystem(entry.key, platform!))
      .map((entry) => entry.key),
  );
  const selected = selectedSubsystemKeys(company, platform);
  const visibleKeys = new Set([...companyKeys, ...platformKeys]);

  return Object.freeze(
    Object.fromEntries(
      subsystemMetadataValues()
        .filter((subsystem) => visibleKeys.has(subsystem.key))
        .map((subsystem) => [
          subsystem.key,
          Object.freeze({
            ...subsystem,
            selected: selected.has(subsystem.key),
            entities: Object.freeze(
              Object.values(allManatOSObjectMetadata)
                .filter((metadata) => metadata.subsystem === subsystem.key)
                .map((metadata) => metadata.key),
            ),
            enums: Object.freeze(Object.keys(subsystem.enums ?? {})),
          }),
        ]),
    ),
  );
}

/**
 * Modern effective runtime subsystem projection.
 *
 * Unlike the legacy catalogue, each subsystem advertises only objects/enums
 * that are actually effective for the selected composition, so runtime
 * subsystem discovery cannot contradict `runtime.entities` / `runtime.enums`.
 */
export function effectiveSubsystemContextCatalogue(
  company: CompanyInfo,
  platform: SysPlatform | null,
): Readonly<Record<string, ManatOSSubsystemContextProjection>> {
  const legacy = subsystemContextCatalogue(company, platform);
  const effectiveObjects = effectiveObjectKeys(company, platform);
  const effectiveEnums = effectiveEnumKeys(company, platform);

  return Object.freeze(
    Object.fromEntries(
      Object.entries(legacy).map(([key, subsystem]) => [
        key,
        Object.freeze({
          ...subsystem,
          entities: Object.freeze(
            subsystem.entities.filter((entity) => effectiveObjects.has(entity)),
          ),
          enums: Object.freeze(subsystem.enums.filter((enumKey) => effectiveEnums.has(enumKey))),
        }),
      ]),
    ),
  );
}
