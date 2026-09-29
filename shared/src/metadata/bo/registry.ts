import { sysBOUsersMetadata } from './auth/bo-users.js';
import { sysBOExternalIdentityMetadata } from './auth/bo-external-identities.js';
import { sysBOUserInvitationMetadata } from './auth/bo-user-invitations.js';
import { sysBOExtAuthProvidersMetadata } from './auth/bo-ext-auth-providers.js';
import { sysBOEmailAddressesMetadata } from './contacts/bo-email-addresses.js';
import { sysBOPrincipalEmailAddressesMetadata } from './principals/bo-principal-email-addresses.js';
import { sysBOTelephoneNumbersMetadata } from './contacts/bo-telephone-numbers.js';
import { sysBOPrincipalTelephoneNumbersMetadata } from './principals/bo-principal-telephone-numbers.js';
import { sysBOAddressesMetadata } from './contacts/bo-addresses.js';
import { sysBOPrincipalAddressesMetadata } from './principals/bo-principal-addresses.js';
import { sysBOPrincipalsMetadata } from './principals/bo-principals.js';
import { sysBOApplicationsMetadata } from './platforms/protocrm/applications/bo-applications.js';
import { sysBOLicensesMetadata } from './licensing/bo-licenses.js';
import { sysBOConfigurationsMetadata } from './configuration/bo-configurations.js';

/** Canonical related/value-object metadata that is not exposed as generic SysBO CRUD. */
export const allManatOSValueObjectMetadata = {
  [sysBOExternalIdentityMetadata.key]: sysBOExternalIdentityMetadata,
  [sysBOUserInvitationMetadata.key]: sysBOUserInvitationMetadata,
} as const;

/** Canonical registry of every first-class SysBO. */
export const allSysBOMetadata = {
  [sysBOUsersMetadata.key]: sysBOUsersMetadata,
  [sysBOPrincipalsMetadata.key]: sysBOPrincipalsMetadata,
  [sysBOEmailAddressesMetadata.key]: sysBOEmailAddressesMetadata,
  [sysBOPrincipalEmailAddressesMetadata.key]: sysBOPrincipalEmailAddressesMetadata,
  [sysBOTelephoneNumbersMetadata.key]: sysBOTelephoneNumbersMetadata,
  [sysBOPrincipalTelephoneNumbersMetadata.key]: sysBOPrincipalTelephoneNumbersMetadata,
  [sysBOAddressesMetadata.key]: sysBOAddressesMetadata,
  [sysBOPrincipalAddressesMetadata.key]: sysBOPrincipalAddressesMetadata,
  [sysBOApplicationsMetadata.key]: sysBOApplicationsMetadata,
  [sysBOLicensesMetadata.key]: sysBOLicensesMetadata,
  [sysBOExtAuthProvidersMetadata.key]: sysBOExtAuthProvidersMetadata,
  [sysBOConfigurationsMetadata.key]: sysBOConfigurationsMetadata,
} as const;

/** All canonical objects, used by relationship/report/designer registries. */
export const allManatOSObjectMetadata = {
  ...allSysBOMetadata,
  ...allManatOSValueObjectMetadata,
} as const;
