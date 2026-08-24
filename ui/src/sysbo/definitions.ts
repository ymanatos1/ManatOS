import {
  SysUserRole,
  sysApplicationsMetadata,
  sysLicensesMetadata,
  sysPrincipalsMetadata,
  sysUsersMetadata,
} from '@manatos/shared';

import type { SysBODefinition, SysBOPaginationConfiguration, SysBOPermissions } from './types.js';

/**
 * System-business-object permissions are role/action specific.
 * Users may read/view current SysBOs; mutations remain Admin-only.
 */
const adminRoles = [SysUserRole.Admin];
const readRoles = [SysUserRole.Admin, SysUserRole.User];

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

  defaultPageSize: 10,

  allowedPageSizes: [10, 20, 50, 100],

  maxPageSize: 100,

  showPageSizeSelector: true,

  showFirstLastButtons: true,

  maxVisiblePageButtons: 7,
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
      },

      gridConfiguration: {
        allowSorting: true,

        allowFiltering: true,

        responsive: true,

        visibleFields: ['name', 'principalId', 'applicationId', 'status', 'validUntil', 'enabled'],
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
