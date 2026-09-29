import type { SysBOExternalIdentity } from '@manatos/shared';

import { apiClient } from '../api/client.js';

/**
 * Read-only external authentication identities for one SysBOUser.
 *
 * The browser never calls the trusted internal endpoint directly; this runs
 * only on the server-rendered UI tier.
 */
export async function externalIdentitiesForUser(userId: string): Promise<SysBOExternalIdentity[]> {
  return (
    await apiClient.get<SysBOExternalIdentity[]>(
      `/api/v1/internal/SysUsers/${encodeURIComponent(userId)}/external-identities`,
      {
        internal: true,
      },
    )
  ).data;
}
