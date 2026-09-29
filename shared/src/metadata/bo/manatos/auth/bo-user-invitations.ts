import type { SysBOUserInvitation } from '../../../../domain/entities.js';
import type { ManatOSValueObjectMetadata } from '../../types.js';
import { commonSysBOFields } from '../../common.js';

export const sysBOUserInvitationMetadata: ManatOSValueObjectMetadata<SysBOUserInvitation> = {
  key: 'user-invitations',
  name: 'sysUserInvitations',
  subsystem: 'auth',
  label: 'User invitation',
  pluralLabel: 'User invitations',
  primaryField: 'email',
  // Canonical relationships
  relationships: {
    principal: {
      fields: ['principalId'],
      references: {
        objectKey: 'sys-principals',
        fields: ['id'],
      },
      cardinality: 'many-to-one',
      policies: {
        delete: {
          action: 'cascade',
          confirmation: 'confirm',
        },
      },
    },
  },
  // Canonical fields
  fieldDefinition: {
    ...commonSysBOFields,
    email: {
      key: 'email',
      label: 'Email',
      type: 'email',
      order: 20,

      required: true,
      maxLength: 320,
    },
    principalId: {
      key: 'principalId',
      label: 'Principal',
      type: 'reference',
      order: 30,

      required: true,
    },
    requestedRole: {
      key: 'requestedRole',
      label: 'Requested role',
      type: 'enum',
      order: 50,

      required: true,
      enum: 'SysBOUserRole',
    },
    tokenHash: {
      key: 'tokenHash',
      label: 'Token hash',
      type: 'string',
      order: 60,

      required: true,
      sensitive: true,
    },
    expiresAt: {
      key: 'expiresAt',
      label: 'Expires',
      type: 'datetime',
      order: 70,

      required: true,
    },
    usedAt: {
      key: 'usedAt',
      label: 'Used',
      type: 'datetime',
      order: 80,

      nullable: true,
    },
  },
};

/** Registry of canonical related/value-object metadata (not generic SysBO CRUD). */

// ============================================================================
// SYS EXTERNAL AUTH PROVIDERS
// ============================================================================
