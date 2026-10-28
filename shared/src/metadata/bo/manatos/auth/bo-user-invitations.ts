import type { SysBOUserInvitation } from '../../../../domain/entities.js';
import type { ManatOSValueObjectMetadata } from '../../types.js';
import { commonSysBOFields } from '../../common.js';

export const sysBOUserInvitationMetadata: ManatOSValueObjectMetadata<SysBOUserInvitation> = {
  key: 'user-invitations',
  name: 'sysUserInvitations',
  subsystem: 'auth',
  label: '@EN.manatos.auth.userInvitations.label.UserInvitation' /* User invitation */,
  pluralLabel:
    '@EN.manatos.auth.userInvitations.pluralLabel.UserInvitations' /* User invitations */,
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
      label: '@EN.manatos.auth.externalIdentities.label.Email' /* Email */,
      type: 'email',
      order: 20,

      required: true,
      maxLength: 320,
    },
    principalId: {
      key: 'principalId',
      label: '@EN.manatos.auth.userInvitations.label.Principal' /* Principal */,
      type: 'reference',
      order: 30,

      required: true,
    },
    requestedRole: {
      key: 'requestedRole',
      label: '@EN.manatos.auth.userInvitations.label.RequestedRole' /* Requested role */,
      type: 'enum',
      order: 50,

      required: true,
      enum: 'SysBOUserRole',
    },
    tokenHash: {
      key: 'tokenHash',
      label: '@EN.manatos.auth.userInvitations.label.TokenHash' /* Token hash */,
      type: 'string',
      order: 60,

      required: true,
      sensitive: true,
    },
    expiresAt: {
      key: 'expiresAt',
      label: '@EN.manatos.auth.userInvitations.label.Expires' /* Expires */,
      type: 'datetime',
      order: 70,

      required: true,
    },
    usedAt: {
      key: 'usedAt',
      label: '@EN.manatos.auth.userInvitations.label.Used' /* Used */,
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
