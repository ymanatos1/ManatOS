import type { SysBOPrincipal } from '../../../../domain/entities.js';
import type { SysBOMetadata } from '../../types.js';
import { commonSysBOFields } from '../../common.js';

export const sysBOPrincipalsMetadata: SysBOMetadata<SysBOPrincipal> = {
  key: 'sys-principals',
  name: 'sysPrincipals',
  subsystem: 'principals',
  label: '@EN.manatos.principals.principals.label.Principal' /* Principal */,
  labelForms: { genitive: '@EN.manatos.principals.principals.label.PrincipalGenitive' },
  pluralLabel: '@EN.manatos.principals.principals.pluralLabel.Principals' /* Principals */,

  primaryField: 'name',

  // Entry identity / representation
  entry: {
    image: { field: 'photo' },
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
    user: {
      fields: ['userId'],
      references: { objectKey: 'sys-users', fields: ['id'] },
      cardinality: 'one-to-one',
      sourceFilterExpression: "principalType === 'Person'",
      selection: {
        uniqueThrough: { objectKey: 'sys-principals', field: 'userId' },
      },
      policies: { delete: { action: 'set-null', confirmation: 'confirm' } },
    },
    parent: {
      fields: ['parentId'],
      references: {
        objectKey: 'sys-principals',
        fields: ['id'],
      },
      cardinality: 'many-to-one',
      selection: {
        filterEnumItemTrait: { field: 'principalType', trait: 'isContainer' },
        excludeCurrent: true,
        createRelated: {
          uiOverrides: {
            principalType: { allowedEnumItemTrait: 'isContainer' },
          },
        },
      },
      policies: {
        delete: {
          action: 'set-null',
          confirmation: 'confirm',
        },
      },
    },
    root: {
      fields: ['rootId'],
      references: {
        objectKey: 'sys-principals',
        fields: ['id'],
      },
      cardinality: 'many-to-one',
      policies: {
        delete: {
          action: 'set-null',
          confirmation: 'silent',
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
      label: '@EN.manatos.auth.users.label.FullName' /* Full name */,
      calculation: {
        expression:
          "principalType === 'Person' ? (firstName != null && firstName !== '' ? (lastName != null && lastName !== '' ? firstName + ' ' + lastName : firstName) : lastName != null && lastName !== '' ? lastName : '') : name",
        persisted: true,
      },
    },

    firstName: {
      key: 'firstName',
      label: '@EN.manatos.auth.users.label.FirstName' /* First name */,
      type: 'string',
      order: 11,
      maxLength: 100,
      normalize: {
        expression: 'Capitalize(value)',
      },
    },

    lastName: {
      key: 'lastName',
      label: '@EN.manatos.auth.users.label.LastName' /* Last name */,
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
      label: '@EN.manatos.auth.users.label.Photo' /* Photo */,
      type: 'picture',
      order: 19,
      nullable: true,
      applicationManaged: true,
    },

    principalType: {
      key: 'principalType',
      label: '@EN.manatos.principals.principals.label.PrincipalType' /* Principal type */,
      type: 'enum',
      order: 20,

      required: true,
      createDefaultValue: 'Person',
      enum: 'SysBOPrincipalType',
    },

    // Relationships and hierarchy
    userId: {
      key: 'userId',
      label: '@EN.manatos.auth.externalIdentities.label.User' /* User */,
      type: 'reference',
      order: 25,
      nullable: true,
      unique: true,
    },

    parentId: {
      key: 'parentId',
      label: '@EN.manatos.principals.principals.label.ParentPrincipal' /* Parent principal */,
      type: 'reference',
      order: 30,

      nullable: true,
    },

    rootId: {
      key: 'rootId',
      label: '@EN.manatos.principals.principals.label.RootPrincipal' /* Root principal */,
      type: 'reference',
      order: 35,

      nullable: true,
      readOnly: true,
      calculation: {
        expression:
          "parentId == null ? null : TraverseEntity(parentId, 'sys-principals', 'parentId', 'id')",
        persisted: true,
      },
    },

    description: {
      key: 'description',
      label: '@EN.manatos.auth.users.label.Description' /* Description */,
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
