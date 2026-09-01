import {
  sysBOUsersUIMetadata,
  sysBOPrincipalsUIMetadata,
  sysBOApplicationsUIMetadata,
  sysBOLicensesUIMetadata,
  sysBOExtAuthProvidersUIMetadata,
  type SysBOMetadata,
  type SysBOUIMetadata,
} from '@manatos/shared';

/** Authoritative framework-neutral UI metadata registry for generic SysBO pages. */
export const allSysBOUIMetadata: Readonly<Record<string, SysBOUIMetadata>> = {
  [sysBOUsersUIMetadata.key]: sysBOUsersUIMetadata,
  [sysBOPrincipalsUIMetadata.key]: sysBOPrincipalsUIMetadata,
  [sysBOApplicationsUIMetadata.key]: sysBOApplicationsUIMetadata,
  [sysBOLicensesUIMetadata.key]: sysBOLicensesUIMetadata,
  [sysBOExtAuthProvidersUIMetadata.key]: sysBOExtAuthProvidersUIMetadata,
};

export function getSysBOUIMetadata(key: string): SysBOUIMetadata | undefined {
  return allSysBOUIMetadata[key];
}


/**
 * Return the one effective UI contract exposed by every API surface.
 * Canonical/entity derived fields are always available to renderers, while
 * UI metadata may add presentation-only calculations with the same keyed shape.
 */
export function getEffectiveSysBOUIMetadata<T>(metadata: SysBOMetadata<T>): SysBOUIMetadata | undefined {
  const metadataUI = getSysBOUIMetadata(metadata.key);
  if (!metadataUI) return undefined;

  return {
    ...metadataUI,
    record: {
      ...metadataUI.record,
      derivedFields: {
        ...(metadata.derivedFields ?? {}),
        ...(metadataUI.record.derivedFields ?? {}),
      },
    },
  };
}
