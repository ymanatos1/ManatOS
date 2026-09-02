import type {
  SysBOApplication,
  SysBOConfiguration,
  SysBOExtAuthProvider,
  SysEmailAddress,
  SysPrincipalEmailAddress,
  SysTelephoneNumber,
  SysPrincipalTelephoneNumber,
  SysAddress,
  SysPrincipalAddress,
  SysBOMetadata,
  SysBOLicense,
  SysBOPrincipal,
  SysBOUser,
  SysBOUserRole,
} from '@manatos/shared';

/** Role-level permissions associated with one UI-visible SysBO. */
export interface SysBOPermissions {
  view: SysBOUserRole[];
  create: SysBOUserRole[];
  edit: SysBOUserRole[];
  delete: SysBOUserRole[];
}

/**
 * UI route definition for a first-class SysBO.
 *
 * Presentation layout, fields, tabs, filters and actions no longer live here:
 * they are supplied by the framework-neutral `$metadata-ui` contract. The UI
 * registry keeps only route/security facts that are genuinely local to this UI
 * host, plus the semantic entity icon used by shared shell/navigation surfaces.
 *
 * Internal/supporting SysBOs deliberately participate in this route-definition
 * type because generic UI infrastructure may resolve them for relationships and
 * collection editors even when canonical metadata says `exposure: 'internal'`
 * and therefore no standalone Administration page is exposed for them.
 */
export interface SysBODefinitionFor<T> {
  key: string;
  boMetadata: SysBOMetadata<T>;
  icon: string;
  permissions: SysBOPermissions;
}

export type SysBODefinition =
  | SysBODefinitionFor<SysBOUser>
  | SysBODefinitionFor<SysBOPrincipal>
  | SysBODefinitionFor<SysBOApplication>
  | SysBODefinitionFor<SysBOConfiguration>
  | SysBODefinitionFor<SysBOExtAuthProvider>
  | SysBODefinitionFor<SysEmailAddress>
  | SysBODefinitionFor<SysPrincipalEmailAddress>
  | SysBODefinitionFor<SysTelephoneNumber>
  | SysBODefinitionFor<SysPrincipalTelephoneNumber>
  | SysBODefinitionFor<SysAddress>
  | SysBODefinitionFor<SysPrincipalAddress>
  | SysBODefinitionFor<SysBOLicense>;
