/**
 * Compatibility re-export only.
 *
 * Canonical framework-neutral SysBO UI metadata now lives beside the canonical
 * entity metadata in @manatos/shared. API code serves that shared contract; it
 * does not own a second presentation catalogue.
 */
export {
  sysBOUsersUIMetadata,
  sysBOPrincipalsUIMetadata,
  sysBOApplicationsUIMetadata,
  sysBOLicensesUIMetadata,
  sysBOExtAuthProvidersUIMetadata,
} from '@manatos/shared';
