import {
  sysBOExtAuthProvidersMetadata,
  sysBOExternalIdentityMetadata,
  sysBOUserInvitationMetadata,
  sysBOUsersMetadata,
} from './identity.js';
import {
  sysBOAddressesMetadata,
  sysBOEmailAddressesMetadata,
  sysBOPrincipalAddressesMetadata,
  sysBOPrincipalEmailAddressesMetadata,
  sysBOPrincipalTelephoneNumbersMetadata,
  sysBOTelephoneNumbersMetadata,
} from './contact.js';
import {
  sysBOApplicationsMetadata,
  sysBOConfigurationsMetadata,
  sysBOLicensesMetadata,
  sysBOPrincipalsMetadata,
} from './business.js';

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
