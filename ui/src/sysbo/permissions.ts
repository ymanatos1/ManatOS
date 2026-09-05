import createError from 'http-errors';
import type { Request } from 'express';

import type { SysBOAuthorizationCapabilities } from '@manatos/shared';

import { apiClient } from '../api/client.js';
import { apiSessionOptions } from '../auth/api-session.js';

import { apiPathFor } from './api-path.js';
import type { SysBODefinition } from './types.js';

/**
 * Canonical UI-facing capability shape consumed by metadata/page CTX.
 *
 * The UI uses the same authorization vocabulary as the API so capability
 * projection crosses layers without semantic renaming. UI mode names such as
 * `view` and `edit` remain separate presentation concepts.
 */
export interface UIEntityPermissions {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

interface SysBOCapabilityProjection {
  sysBOKey: string;
  scope: 'collection' | 'record';
  capabilities: SysBOAuthorizationCapabilities;
}

/**
 * Resolve presentation capabilities from the API's authoritative
 * AuthorizationService projection.
 *
 * No role matrix or record-specific authorization rule is evaluated in the UI
 * server. The returned snapshot is only presentation input; the API still
 * re-authorizes every actual read/write/delete operation at execution time.
 *
 * Owner-managed `draft:*` members do not exist as persisted API records yet.
 * Their update capability during the create workflow is therefore derived from
 * the authoritative collection `create` capability. This is lifecycle adaptation,
 * not an independent authorization rule.
 */
export async function resolveUIEntityPermissions(
  req: Request,
  definition: SysBODefinition,
  recordId?: string,
): Promise<UIEntityPermissions> {
  const apiPath = apiPathFor(definition.key);

  const isDraft = Boolean(recordId?.startsWith('draft:'));
  const capabilityPath =
    recordId && !isDraft
      ? `/api/v1/${apiPath}/${encodeURIComponent(recordId)}/$capabilities`
      : `/api/v1/${apiPath}/$capabilities`;

  const response = await apiClient.get<SysBOCapabilityProjection>(
    capabilityPath,
    apiSessionOptions(req),
  );
  const capabilities = response.data.capabilities;

  return {
    read: capabilities.read,
    create: capabilities.create,
    update: isDraft ? capabilities.create : capabilities.update,
    delete: capabilities.delete,
  };
}

/** Throw the standard UI 403 used by both generic and platform feature routes. */
export function requirePermission(allowed: boolean, message: string): void {
  if (!allowed) throw createError(403, message);
}
