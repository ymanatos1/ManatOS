import type { Request } from 'express';

import {
  resolveEntryRepresentation,
  type SysBOMetadata,
  type SysBOUIMetadata,
} from '@manatos/shared';

import { apiClient } from '../../api/client.js';
import { apiSessionOptions } from '../../auth/api-session.js';
import { getSysBODefinition } from '../../sysbo/definitions.js';
import type { SysBODefinition } from '../../sysbo/types.js';

/**
 * Canonical UI-to-API resource mapping for metadata-driven SysBO routes.
 *
 * Keep this transport mapping outside route orchestration so list, entry,
 * hierarchy and supplemental-data loaders all consume the same API resource
 * contract.
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

/** Generic SysBO list payload returned by the API. */
export interface SysBOListData<T> {
  items: T[];
  paging: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  metadata?: unknown;
}

/** Resolve one configured API resource name. */
export function apiPathFor(key: string): string {
  const apiPath = pathByKey[key];
  if (!apiPath) {
    throw new Error(`No API path is configured for SysBO '${key}'.`);
  }
  return apiPath;
}

/**
 * Load canonical, UI-neutral SysBO metadata through the API boundary.
 *
 * Generic pages must consume the same canonical metadata exposed externally;
 * they must not grow a private UI-server definition path.
 */
export async function canonicalSysBOMetadata(
  req: Request,
  definition: SysBODefinition,
): Promise<SysBOMetadata<Record<string, unknown>>> {
  const response = await apiClient.get<{ metadata: SysBOMetadata<Record<string, unknown>> }>(
    `/api/v1/${apiPathFor(definition.key)}/$metadata`,
    apiSessionOptions(req),
  );
  return response.data.metadata;
}

/** Load framework-neutral presentation metadata for one SysBO. */
export async function canonicalSysBOUIMetadata(
  req: Request,
  definition: SysBODefinition,
): Promise<SysBOUIMetadata> {
  const response = await apiClient.get<{ metadataUI: SysBOUIMetadata }>(
    `/api/v1/${apiPathFor(definition.key)}/$metadata-ui`,
    apiSessionOptions(req),
  );
  return response.data.metadataUI;
}

/**
 * Load referenced BO values used by reference/select controls.
 *
 * The projection keeps the complete canonical record and adds generic
 * value/label/icon presentation facts. No caller needs entity-specific
 * knowledge of the referenced object's primary display field.
 */
export async function references(
  req: Request,
  definition: SysBODefinition,
): Promise<Record<string, Readonly<Record<string, unknown>>[]>> {
  const output: Record<string, Readonly<Record<string, unknown>>[]> = {};

  for (const field of Object.values(definition.boMetadata.fieldDefinition)) {
    if (!field.referenceBOKey) continue;

    const apiPath = pathByKey[field.referenceBOKey];
    if (!apiPath) continue;

    const response = await apiClient.get<SysBOListData<unknown>>(
      `/api/v1/${apiPath}?pageSize=500&sort=name`,
      apiSessionOptions(req),
    );

    const referencedDefinition = getSysBODefinition(field.referenceBOKey);
    const referencedPrimaryField = referencedDefinition.boMetadata.primaryField;
    output[field.key] = response.data.items.map((item) => {
      const record = item as Record<string, unknown>;
      const id = record.id;
      const primaryValue = record[referencedPrimaryField];
      const representation = resolveEntryRepresentation(
        referencedDefinition.boMetadata,
        null,
        record,
        { entityIcon: referencedDefinition.icon },
      );

      return {
        ...record,
        value: id,
        label: representation.name || primaryValue || record.name || id,
        __entryIcon: representation.icons.at(-1) ?? null,
        __entityIcon: referencedDefinition.icon.replace(/^bi-/, ''),
      };
    });
  }

  return output;
}
