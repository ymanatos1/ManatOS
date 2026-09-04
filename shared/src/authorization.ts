/**
 * Canonical API authorization capability projection for one SysBO scope.
 *
 * These flags are presentation inputs for clients. They do not replace the
 * authoritative server-side authorization check that runs again when an API
 * operation executes.
 */
export interface SysBOAuthorizationCapabilities {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

/**
 * Canonical API capability projection for one platform scope.
 *
 * Clients consume the resolved outcome only; they never receive the license,
 * principal-link or role policy used to derive it.
 */
export interface PlatformAuthorizationCapabilities {
  platformAccess: boolean;
}
