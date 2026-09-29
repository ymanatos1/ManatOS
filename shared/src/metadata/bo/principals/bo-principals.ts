import { SysBOPrincipalType, type SysBOPrincipal } from '../../../domain/entities.js';
import type { SysBOMetadata } from '../types.js';
import { commonSysBOFields } from '../common.js';

export const sysBOPrincipalsMetadata: SysBOMetadata<SysBOPrincipal> = {
  key: 'sys-principals',
  name: 'sysPrincipals',
  subsystem: 'principals',
  label: 'Principal',
  pluralLabel: 'Principals',

  primaryField: 'name',

  // Entry identity / representation
  entry: {
    // Direct single-field identity stays explicit; calculated combinations should
    // use an expression instead of introducing concatenation-specific metadata.
    name: { field: 'name' },
    // Expression form is supported even for direct fields and still preserves
    // enum/reference metadata discovery for simple field expressions.
    type: { expression: 'principalType' },
    description: { field: 'name' },
  },

  // Canonical relationships
  relationships: {
    parent: {
      fields: ['parentId'],
      references: {
        objectKey: 'sys-principals',
        fields: ['id'],
      },
      cardinality: 'many-to-one',
      policies: {
        delete: {
          action: 'set-null',
          confirmation: 'confirm',
        },
      },
    },
  },

  // Canonical fields
  fieldDefinition: {
    ...commonSysBOFields,

    // Identity and naming
    name: {
      ...commonSysBOFields.name!,
      label: 'Full name',
      calculation: {
        expression:
          "principalType === 'Person' ? (firstName != null && firstName !== '' ? (lastName != null && lastName !== '' ? firstName + ' ' + lastName : firstName) : lastName != null && lastName !== '' ? lastName : '') : name",
        persisted: true,
      },
    },

    firstName: {
      key: 'firstName',
      label: 'First name',
      type: 'string',
      order: 11,
      maxLength: 100,
      normalize: {
        expression: 'Capitalize(value)',
      },
    },

    lastName: {
      key: 'lastName',
      label: 'Last name',
      type: 'string',
      order: 12,
      maxLength: 100,
      normalize: {
        expression: 'Capitalize(value)',
      },
    },

    // Profile / classification
    photo: {
      key: 'photo',
      label: 'Photo',
      type: 'picture',
      order: 19,
      nullable: true,
      applicationManaged: true,
    },

    principalType: {
      key: 'principalType',
      label: 'Principal type',
      type: 'enum',
      order: 20,

      required: true,
      createDefaultValue: 'Person',
      enumValues: Object.values(SysBOPrincipalType),
      enumItems: [
        {
          value: SysBOPrincipalType.Person,
          label: 'Person',
          icon: 'person',
          isContainer: false,
          canHaveParent: true,
          canBeOrganizationRoot: false,
          canStandAloneOrganization: true,
        },
        {
          value: SysBOPrincipalType.Company,
          label: 'Company',
          icon: 'building',
          isContainer: true,
          canHaveParent: false,
          canBeOrganizationRoot: true,
          canStandAloneOrganization: false,
        },
        {
          value: SysBOPrincipalType.Group,
          label: 'Group',
          icon: 'people',
          isContainer: true,
          canHaveParent: true,
          canBeOrganizationRoot: true,
          canStandAloneOrganization: false,
        },
        {
          value: SysBOPrincipalType.System,
          label: 'System',
          icon: 'gear',
          isContainer: false,
          canHaveParent: true,
          canBeOrganizationRoot: false,
          canStandAloneOrganization: true,
        },
      ],
    },

    // Relationships and hierarchy
    /** Inverse endpoint of SysUser.principalId; not persisted on Principal. */
    userId: {
      key: 'userId',
      label: 'User',
      type: 'reference',
      order: 25,
      nullable: true,
      referenceBOKey: 'sys-users',
      referenceSelection: {
        uniqueThrough: { objectKey: 'sys-users', field: 'principalId' },
      },
    },

    parentId: {
      key: 'parentId',
      label: 'Parent principal',
      type: 'reference',
      order: 30,

      nullable: true,
      referenceBOKey: 'sys-principals',
      referenceSelection: {
        // Parent candidates and newly-created parents are driven by the same
        // canonical container trait policy. The API remains authoritative.
        filterEnumItemTrait: { field: 'principalType', trait: 'isContainer' },
        excludeCurrent: true,
        createRelated: {
          uiOverrides: {
            principalType: { allowedEnumItemTrait: 'isContainer' },
          },
        },
      },
    },

    rootPrincipalId: {
      key: 'rootPrincipalId',
      label: 'Root principal',
      type: 'reference',
      order: 35,

      nullable: true,
      readOnly: true,
      applicationManaged: true,
      referenceBOKey: 'sys-principals',
      calculation: {
        expression:
          "parentId == null ? null : TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')",
        persisted: true,
      },
    },

    description: {
      key: 'description',
      label: 'Description',
      type: 'string',
      order: 40,

      maxLength: 2000,
    },
  },
};

// ============================================================================
// SYS APPLICATIONS
// ============================================================================
/**
 * Managed/licensable application metadata.
 *
 * `name` is the canonical unique application name.
 */
