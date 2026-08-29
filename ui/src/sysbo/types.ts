import type {
  SysBOApplication,
  SysBOConfiguration,
  SysBOExtAuthProvider,
  SysBOMetadata,
  SysBOLicense,
  SysBOPrincipal,
  SysBOUser,
  SysBOUserRole,
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
  roles: SysBOUserRole[];
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
   * Currently used by SysBOApplication to expose its future playground.
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
 * Current EJS-specific UI metadata.
 *
 * This remains the reference implementation during #16. The new framework-neutral
 * API `$metadata-ui` contract is defined in @manatos/shared and must not absorb
 * EJS/Bootstrap-specific details from this structure.
 */
export interface CurrentEJSSysBOUIMetadata {
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
  view: SysBOUserRole[];

  create: SysBOUserRole[];

  edit: SysBOUserRole[];

  delete: SysBOUserRole[];
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

  uiMetadata: CurrentEJSSysBOUIMetadata;

  permissions: SysBOPermissions;
}

/**
 * All currently registered first-class SysBO definition variants.
 *
 * Using a union here is preferable to:
 *
 *   SysBODefinition<unknown>
 *
 * because SysBOMetadata<T> is entity-specific. SysBOMetadata<SysBOUser>,
 * for example, should not be forced into SysBOMetadata<unknown>.
 */
export type SysBODefinition =
  | SysBODefinitionFor<SysBOUser>
  | SysBODefinitionFor<SysBOPrincipal>
  | SysBODefinitionFor<SysBOApplication>
  | SysBODefinitionFor<SysBOConfiguration>
  | SysBODefinitionFor<SysBOExtAuthProvider>
  | SysBODefinitionFor<SysBOLicense>;
