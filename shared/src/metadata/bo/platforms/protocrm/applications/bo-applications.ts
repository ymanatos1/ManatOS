import type { SysBOApplication } from '../../../../../domain/entities.js';
import type { SysBOMetadata } from '../../../types.js';
import { commonSysBOFields } from '../../../common.js';

export const sysBOApplicationsMetadata: SysBOMetadata<SysBOApplication> = {
  key: 'sys-applications',
  name: 'sysApplications',
  subsystem: 'applications',
  label: '@EN.manatos.licensing.licenses.label.Application' /* Application */,
  pluralLabel:
    '@EN.platforms.protocrm.applications.applications.pluralLabel.Applications' /* Applications */,

  primaryField: 'name',

  // Canonical fields
  fieldDefinition: {
    ...commonSysBOFields,

    fullName: {
      key: 'fullName',
      label: '@EN.manatos.auth.users.label.FullName' /* Full name */,
      type: 'string',
      order: 30,

      required: true,
      maxLength: 250,
    },

    version: {
      key: 'version',
      label: '@EN.platforms.protocrm.applications.applications.label.Version' /* Version */,
      type: 'version',
      order: 40,

      maxLength: 50,
      versionFormat: 'semver',
      createDefaultValue: '0.0.1',
    },

    description: {
      key: 'description',
      label: '@EN.manatos.auth.users.label.Description' /* Description */,
      type: 'string',
      order: 50,

      maxLength: 2000,
    },

    pictures: {
      key: 'pictures',
      label: '@EN.platforms.protocrm.applications.applications.label.Pictures' /* Pictures */,
      type: 'pictures',
      order: 60,
      nullable: true,
      applicationManaged: true,
    },

    details: {
      key: 'details',
      label: '@EN.platforms.protocrm.applications.applications.label.Details' /* Details */,
      type: 'richText',
      order: 70,
      nullable: true,
    },
  },
};

// ============================================================================
// SYS LICENSES
// ============================================================================
/**
 * License metadata.
 *
 * A Company-owned license belongs to a SysBOPrincipal (customer identity) and
 * targets exactly one platform. An optional SysBOApplication restriction is
 * currently meaningful for protoCRM; omitting it represents platform-wide scope.
 */
