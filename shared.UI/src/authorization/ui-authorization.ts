import {
  createRuntimeUserContext,
  type ManatOSUserContext,
  type RuntimeUserIdentity,
} from '@manatos/shared';

import type { ManatosApiClient } from '../api/api-client.js';

export interface UiAuthorizationContextProjection {
  platformId: string;
  user: RuntimeUserIdentity;
  platformCapabilities: Readonly<Record<string, unknown>>;
  entities: Readonly<Record<string, Readonly<Record<string, boolean>>>>;
}

export class UiAuthorizationClient {
  constructor(private readonly api: ManatosApiClient) {}

  async load(platformId: string): Promise<UiAuthorizationContextProjection> {
    const response = await this.api.get<UiAuthorizationContextProjection>(
      `/api/v1/authorization/context/${encodeURIComponent(platformId)}/$capabilities`,
    );

    return response.data;
  }
}

export function runtimeUserFromAuthorization(
  projection: UiAuthorizationContextProjection,
): ManatOSUserContext {
  return createRuntimeUserContext(
    projection.user,
    projection.platformId,
    projection.platformCapabilities,
  );
}

/**
 * An authenticated user may select no platform.
 *
 * Preserve identity and role without retaining capability grants
 * from the previously selected platform.
 */
export function runtimeUserWithoutPlatform(
  identity: RuntimeUserIdentity,
  pendingPlatformId: string | null = null,
): ManatOSUserContext {
  const user = createRuntimeUserContext(identity, pendingPlatformId ?? '', {});

  return Object.freeze({
    ...user,
    permissions: Object.freeze({
      userRole: identity.role,
      // A selected platform must have an explicit deny projection while its
      // API capabilities are pending. This also keeps CTX expressions valid.
      platforms: Object.freeze(
        pendingPlatformId
          ? {
              [pendingPlatformId]: Object.freeze({
                capabilities: Object.freeze({ platformAccess: false }),
              }),
            }
          : {},
      ),
    }),
  });
}
