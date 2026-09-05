import { SysBOExtAuthProviderType } from '../../domain.js';
import type { SysBOFieldMetadata } from './types.js';

/**
 * Fields common to all first-class SysBO entities.
 *
 * Note:
 * Because this object is typed as Record<string, SysBOFieldMetadata>
 * and the project enables `noUncheckedIndexedAccess`, an indexed access
 * such as `commonSysBOFields.name` is technically typed as:
 *
 *   SysBOFieldMetadata | undefined
 *
 * Therefore, when we explicitly reuse `commonSysBOFields.name` below, we use the
 * non-null assertion `commonSysBOFields.name!`. We know statically that the property
 * exists because it is declared immediately here.
 */
export const externalAuthProviderOptionItems = [
  { value: SysBOExtAuthProviderType.Microsoft, label: 'Microsoft', icon: 'microsoft' },
  { value: SysBOExtAuthProviderType.Google, label: 'Google', icon: 'google' },
  { value: SysBOExtAuthProviderType.Facebook, label: 'Facebook', icon: 'facebook' },
  { value: SysBOExtAuthProviderType.GitHub, label: 'GitHub', icon: 'github' },
] as const;

export const commonSysBOFields: Record<string, SysBOFieldMetadata> = {
  id: {
    key: 'id',
    label: 'Id',
    type: 'guid',
    order: 0,

    required: true,
    generated: true,
    readOnly: true,
    unique: true,
  },

  name: {
    key: 'name',
    label: 'Name',
    type: 'string',
    order: 10,

    required: true,
    unique: true,

    minLength: 2,
    maxLength: 120,
  },

  enabled: {
    key: 'enabled',
    label: 'Enabled',
    type: 'boolean',
    order: 900,

    required: true,
  },

  createdAt: {
    key: 'createdAt',
    label: 'Created',
    type: 'datetime',
    order: 910,

    generated: true,
    readOnly: true,
  },
  createdBy: {
    key: 'createdBy',
    label: 'Created by',
    type: 'string',
    order: 911,
    generated: true,
    readOnly: true,
  },

  updatedAt: {
    key: 'updatedAt',
    label: 'Updated',
    type: 'datetime',
    order: 920,

    generated: true,
    readOnly: true,
  },
  updatedBy: {
    key: 'updatedBy',
    label: 'Updated by',
    type: 'string',
    order: 921,
    generated: true,
    readOnly: true,
  },
};
