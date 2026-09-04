/**
 * Canonical UI-to-API resource mapping for SysBO transport contracts.
 *
 * This mapping is transport identity only; it contains no authorization or
 * presentation policy. Data access and capability projection deliberately
 * share this one registry so they cannot drift to different API resources.
 */
const pathByKey: Readonly<Record<string, string>> = Object.freeze({
  'sys-users': 'SysUsers',
  'sys-principals': 'SysPrincipals',
  'sys-email-addresses': 'SysEmailAddresses',
  'sys-principal-email-addresses': 'SysPrincipalEmailAddresses',
  'sys-telephone-numbers': 'SysTelephoneNumbers',
  'sys-principal-telephone-numbers': 'SysPrincipalTelephoneNumbers',
  'sys-addresses': 'SysAddresses',
  'sys-principal-addresses': 'SysPrincipalAddresses',
  'sys-applications': 'SysApplications',
  'sys-licenses': 'SysLicenses',
  'sys-ext-auth-providers': 'SysExtAuthProviders',
});

/** Resolve one configured API resource name. */
export function apiPathFor(key: string): string {
  const apiPath = pathByKey[key];
  if (!apiPath) {
    throw new Error(`No API path is configured for SysBO '${key}'.`);
  }
  return apiPath;
}
