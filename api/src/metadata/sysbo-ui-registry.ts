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
 * Return the framework-neutral UI contract exposed by API surfaces.
 * Canonical calculations remain part of canonical fieldDefinition metadata;
 * UI-only calculated context values, when present, remain UI metadata only.
 */
export function getEffectiveSysBOUIMetadata<T>(
  metadata: SysBOMetadata<T>,
): SysBOUIMetadata | undefined {
  return getSysBOUIMetadata(metadata.key);
}
