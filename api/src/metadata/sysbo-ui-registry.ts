import type { SysBOUIMetadata } from '@manatos/shared';

import {
  sysBOUsersUIMetadata,
  sysBOPrincipalsUIMetadata,
  sysBOApplicationsUIMetadata,
  sysBOLicensesUIMetadata,
  sysBOExtAuthProvidersUIMetadata
} from './sysbo-ui-definitions.js';

/** Registry for every SysBO participating in the #16 UI migration. */
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
