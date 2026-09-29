import { sysBOUsersUIMetadata } from './manatos/auth/ui-users.js';
import { sysBOExtAuthProvidersUIMetadata } from './manatos/auth/ui-ext-auth-providers.js';
import { sysBOExternalIdentitiesUIMetadata } from './manatos/auth/ui-external-identities.js';
import { sysBOAddressesUIMetadata } from './manatos/contacts/ui-addresses.js';
import { sysBOEmailAddressesUIMetadata } from './manatos/contacts/ui-email-addresses.js';
import { sysBOTelephoneNumbersUIMetadata } from './manatos/contacts/ui-telephone-numbers.js';
import { sysBOPrincipalsUIMetadata } from './manatos/principals/ui-principals.js';
import { sysBOApplicationsUIMetadata } from './platforms/protocrm/applications/ui-applications.js';
import { sysBOLicensesUIMetadata } from './manatos/licensing/ui-licenses.js';

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
  [sysBOExternalIdentitiesUIMetadata.key]: sysBOExternalIdentitiesUIMetadata,
  [sysBOAddressesUIMetadata.key]: sysBOAddressesUIMetadata,
  [sysBOEmailAddressesUIMetadata.key]: sysBOEmailAddressesUIMetadata,
  [sysBOTelephoneNumbersUIMetadata.key]: sysBOTelephoneNumbersUIMetadata,
} as const;
