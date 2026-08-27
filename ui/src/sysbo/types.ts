import type {
  SysApplication,
  SysExtAuthProvider,
  SysBOMetadata,
  SysLicense,
  SysPrincipal,
  SysUser,
  SysUserRole,
} from '@manatos/shared';

/**
 * List-page UI configuration.
 */
export interface SysBOListViewModel {
  title: string;

  addButtonText: string;

  showResultCount: boolean;
}

/**
 * Tab visibility can be unconditional or restricted to website roles.
 *
 * Omitting the property means visible (the default).
 */
export type SysBOEditTabVisibility = boolean | {
  roles: SysUserRole[];
};

/**
 * One tab available on an entity edit/review page.
 */
export interface SysBOEditTabDefinition {
  id: string;

  title: string;

  icon?: string;

  visible?: SysBOEditTabVisibility;

  /**
   * Optional EJS partial rendered inside this tab. General info is the
   * built-in metadata-driven tab and therefore needs no partial.
   */
  partial?: string;
}

export interface SysBOEditViewModel {
  createTitle: string;

  editTitle: string;

  showDeleteButton: boolean;

  confirmUnsavedChanges: boolean;

  /** Friendly singular entity label used by generic destructive confirmations. */
  deleteEntityLabel?: string;

  /**
   * Entity-page tabs. When omitted, the UI supplies one visible
   * "General info" tab so older definitions remain valid.
   */
  tabs?: SysBOEditTabDefinition[];
}

/**
 * Grid configuration used by a SysBO list page.
 */
export interface SysBOGridConfiguration {
  allowSorting: boolean;

  allowFiltering: boolean;

  responsive: boolean;

  /**
   * Currently used by SysApplication to expose its future playground.
   */
  showPlayAction?: boolean;

  visibleFields: string[];
}

/**
 * Field-based list filtering configuration.
 */
export interface SysBOFilterDefinition {
  mode: 'and';

  allowMultipleFilters: boolean;

  fields: string[];
}

/**
 * Pagination configuration.
 */
export interface SysBOPaginationConfiguration {
  enabled: boolean;

  defaultPageSize: number;

  allowedPageSizes: number[];

  maxPageSize: number;

  showPageSizeSelector: boolean;

  showFirstLastButtons: boolean;

  maxVisiblePageButtons: number;
}

/**
 * UI-specific metadata.
 *
 * This is intentionally separate from the UI-neutral BO metadata
 * originating from @manatos/shared.
 */
export interface SysBOUIMetadata {
  icon: string;

  listViewModel: SysBOListViewModel;

  editViewModel: SysBOEditViewModel;

  gridConfiguration: SysBOGridConfiguration;

  filterDefinition: SysBOFilterDefinition;

  paginationConfiguration: SysBOPaginationConfiguration;
}

/**
 * Role-level permissions associated with a UI SysBO definition.
 */
export interface SysBOPermissions {
  view: SysUserRole[];

  create: SysUserRole[];

  edit: SysUserRole[];

  delete: SysUserRole[];
}

/**
 * Strongly typed SysBO definition for one particular business-object
 * entity type.
 *
 * The BO metadata and UI metadata remain two distinct categories.
 */
export interface SysBODefinitionFor<T> {
  key: string;

  boMetadata: SysBOMetadata<T>;

  uiMetadata: SysBOUIMetadata;

  permissions: SysBOPermissions;
}

/**
 * All currently registered first-class SysBO definition variants.
 *
 * Using a union here is preferable to:
 *
 *   SysBODefinition<unknown>
 *
 * because SysBOMetadata<T> is entity-specific. SysBOMetadata<SysUser>,
 * for example, should not be forced into SysBOMetadata<unknown>.
 */
export type SysBODefinition =
  | SysBODefinitionFor<SysUser>
  | SysBODefinitionFor<SysPrincipal>
  | SysBODefinitionFor<SysApplication>
  | SysBODefinitionFor<SysExtAuthProvider>
  | SysBODefinitionFor<SysLicense>;
