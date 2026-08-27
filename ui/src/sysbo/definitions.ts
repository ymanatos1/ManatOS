import {
  MANATOS_COMPANY,
  effectiveEntityKeys,
  resolvePlatform,
  SysUserRole,
  type CompanyInfo,
  type PlatformInfo,
  sysApplicationsMetadata,
  sysExtAuthProvidersMetadata,
  sysLicensesMetadata,
  sysPrincipalsMetadata,
  sysUsersMetadata,
} from '@manatos/shared';

import { config } from '../config.js';

import type {
  SysBODefinition,
  SysBOEditTabDefinition,
  SysBOPaginationConfiguration,
  SysBOPermissions,
} from './types.js';

/**
 * System-business-object permissions are role/action specific.
 * Users may read/view current SysBOs; mutations remain Admin-only.
 */
const adminRoles = [SysUserRole.Admin];
const readRoles = [SysUserRole.Admin, SysUserRole.Superuser, SysUserRole.User];

const permissions: SysBOPermissions = {
  view: readRoles,

  create: adminRoles,

  edit: adminRoles,

  delete: adminRoles,
};

/**
 * Shared default pagination configuration.
 */
const pagination: SysBOPaginationConfiguration = {
  enabled: true,

  defaultPageSize: config.UI_DEFAULT_PAGE_SIZE,

  allowedPageSizes: config.UI_PAGE_SIZE_OPTIONS,

  maxPageSize: Math.max(...config.UI_PAGE_SIZE_OPTIONS),

  showPageSizeSelector: true,

  showFirstLastButtons: true,

  maxVisiblePageButtons: 7,
};

/**
 * Standard first tab used by every entity edit/review page.
 * Visibility is omitted deliberately: visible is the default.
 */
const generalInfoTab: SysBOEditTabDefinition = {
  id: 'general',
  title: 'General info',
  icon: 'bi-info-circle',
};

/**
 * Registry of all UI-visible system business objects.
 *
 * The registry key is the stable hard-coded SysBO key, not an entity GUID.
 */
export const sysBODefinitions: Record<string, SysBODefinition> = {
  'sys-users': {
    key: 'sys-users',

    boMetadata: sysUsersMetadata,

    uiMetadata: {
      icon: 'bi-people-fill',

      listViewModel: {
        title: 'Users',

        addButtonText: 'Add new',

        showResultCount: true,
      },

      editViewModel: {
        createTitle: 'Add User',

        editTitle: 'Edit User',

        showDeleteButton: true,

        confirmUnsavedChanges: true,

        deleteEntityLabel: 'User',

        tabs: [
          generalInfoTab,
          {
            id: 'authentication',
            title: 'Authentication',
            icon: 'bi-shield-lock',
            visible: {
              roles: [SysUserRole.Admin],
            },
          },
        ],
      },

      gridConfiguration: {
        allowSorting: true,

        allowFiltering: true,

        responsive: true,

        visibleFields: ['name', 'email', 'role', 'emailVerified', 'enabled'],
      },

      filterDefinition: {
        mode: 'and',

        allowMultipleFilters: true,

        fields: ['name', 'email', 'role'],
      },

      paginationConfiguration: pagination,
    },

    permissions,
  },

  'sys-principals': {
    key: 'sys-principals',

    boMetadata: sysPrincipalsMetadata,

    uiMetadata: {
      icon: 'bi-diagram-3-fill',

      listViewModel: {
        title: 'Principals / Customers',

        addButtonText: 'Add new',

        showResultCount: true,
      },

      editViewModel: {
        createTitle: 'Add Principal',

        editTitle: 'Edit Principal',

        showDeleteButton: true,

        confirmUnsavedChanges: true,

        deleteEntityLabel: 'Principal',

        tabs: [generalInfoTab],
      },

      gridConfiguration: {
        allowSorting: true,

        allowFiltering: true,

        responsive: true,

        visibleFields: ['name', 'principalType', 'parentId', 'enabled'],
      },

      filterDefinition: {
        mode: 'and',

        allowMultipleFilters: true,

        fields: ['name', 'principalType'],
      },

      paginationConfiguration: pagination,
    },

    permissions,
  },

  'sys-applications': {
    key: 'sys-applications',

    boMetadata: sysApplicationsMetadata,

    uiMetadata: {
      icon: 'bi-window-stack',

      listViewModel: {
        title: 'Applications',

        addButtonText: 'Add new',

        showResultCount: true,
      },

      editViewModel: {
        createTitle: 'Add Application',

        editTitle: 'Edit Application',

        showDeleteButton: true,

        confirmUnsavedChanges: true,

        deleteEntityLabel: 'Application',

        tabs: [generalInfoTab],
      },

      gridConfiguration: {
        allowSorting: true,

        allowFiltering: true,

        responsive: true,

        showPlayAction: true,

        visibleFields: ['name', 'appName', 'fullName', 'version', 'enabled'],
      },

      filterDefinition: {
        mode: 'and',

        allowMultipleFilters: true,

        fields: ['name', 'appName', 'fullName'],
      },

      paginationConfiguration: pagination,
    },

    permissions,
  },


  'sys-ext-auth-providers': {
    key: 'sys-ext-auth-providers',
    boMetadata: sysExtAuthProvidersMetadata,
    uiMetadata: {
      icon: 'bi-globe2',
      listViewModel: { title: 'External authentication', addButtonText: 'Add provider', showResultCount: true },
      editViewModel: {
        createTitle: 'Add external authentication provider',
        editTitle: 'Edit external authentication provider',
        showDeleteButton: true,
        confirmUnsavedChanges: true,
        deleteEntityLabel: 'External Provider',
        tabs: [
          generalInfoTab,
          {
            id: 'secrets',
            title: 'Secrets',
            icon: 'bi-key-fill',
            partial: '../partials/ext-auth-provider-secrets',
          },
        ],
      },
      gridConfiguration: { allowSorting: true, allowFiltering: true, responsive: true, visibleFields: ['provider','enabled','callbackPath','credentialsConfigured'] },
      filterDefinition: { mode: 'and', allowMultipleFilters: true, fields: ['provider'] },
      paginationConfiguration: pagination,
    },
    permissions: { view: adminRoles, create: adminRoles, edit: adminRoles, delete: adminRoles },
  },

  'sys-licenses': {
    key: 'sys-licenses',

    boMetadata: sysLicensesMetadata,

    uiMetadata: {
      icon: 'bi-key',

      listViewModel: {
        title: 'Licenses',

        addButtonText: 'Add new',

        showResultCount: true,
      },

      editViewModel: {
        createTitle: 'Add License',

        editTitle: 'Edit License',

        showDeleteButton: true,

        confirmUnsavedChanges: true,

        deleteEntityLabel: 'License',

        tabs: [generalInfoTab],
      },

      gridConfiguration: {
        allowSorting: true,

        allowFiltering: true,

        responsive: true,

        visibleFields: ['name', 'principalId', 'platformId', 'applicationId', 'status', 'validUntil', 'enabled'],
      },

      filterDefinition: {
        mode: 'and',

        allowMultipleFilters: true,

        fields: ['name', 'status'],
      },

      paginationConfiguration: pagination,
    },

    permissions,
  },
};

/**
 * Resolve one SysBO definition by its stable registry key.
 */
export function getSysBODefinition(key: string): SysBODefinition {
  const definition = sysBODefinitions[key];

  if (!definition) {
    throw new Error(`Unknown SysBO '${key}'.`);
  }

  return definition;
}


/**
 * Compose the SysBO registry exposed by the UI from Company-owned entities
 * plus the selected Platform's entity contributions.
 *
 * Keeping the full definition catalogue in this module preserves strongly
 * typed UI metadata, while ownership decides which subset is effective for a
 * given platform context.
 */
export function effectiveSysBODefinitions(
  company: CompanyInfo = MANATOS_COMPANY,
  platform: PlatformInfo = resolvePlatform(company),
): Record<string, SysBODefinition> {
  const keys = effectiveEntityKeys(company, platform);

  return Object.fromEntries(
    Object.entries(sysBODefinitions).filter(([key]) => keys.has(key)),
  );
}
