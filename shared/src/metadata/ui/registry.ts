import {
  sysBOApplicationsUIMetadata,
  sysBOLicensesUIMetadata,
  sysBOPrincipalsUIMetadata,
} from './business.js';
import {
  sysBOExtAuthProvidersUIMetadata,
  sysBOUsersUIMetadata,
} from './identity.js';

/**
 * Complete framework-neutral SysBO UI-metadata registry.
 *
 * Presentation infrastructure uses this registry when it needs metadata for an
 * entity other than the page owner (for example a related-record row). Keeping
 * discovery here prevents UI renderers from maintaining parallel entity lists.
 */
export const allSysBOUIMetadata = {
  [sysBOUsersUIMetadata.key]: sysBOUsersUIMetadata,
  [sysBOPrincipalsUIMetadata.key]: sysBOPrincipalsUIMetadata,
  [sysBOApplicationsUIMetadata.key]: sysBOApplicationsUIMetadata,
  [sysBOLicensesUIMetadata.key]: sysBOLicensesUIMetadata,
  [sysBOExtAuthProvidersUIMetadata.key]: sysBOExtAuthProvidersUIMetadata,
} as const;
