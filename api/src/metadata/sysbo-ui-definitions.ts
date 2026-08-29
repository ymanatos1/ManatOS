import type { SysBOUIMetadata, SysBOUIRecordTabMetadata } from '@manatos/shared';

/**
 * Framework-neutral SysBO UI metadata registry used by the metadata-driven
 * administration renderer.
 *
 * The values below intentionally mirror the presentation semantics of the
 * current EJS SysBO definitions as closely as the current shared contract can
 * express them. EJS partial names, Bootstrap classes and browser-only details
 * do not belong in this registry.
 *
 * A few current EJS behaviours are richer than SysBOUIMetadata can represent
 * today (for example create-vs-edit field mutability and specialized
 * authentication/secret controls). Those remain renderer-specific until the
 * shared contract is extended deliberately.
 */
const tab = (
  id: string,
  label: string,
  order: number,
  fields: readonly string[],
  options: Pick<SysBOUIRecordTabMetadata, 'icon' | 'layout'> = {},
): SysBOUIRecordTabMetadata => ({ id, label, order, fields, ...options });

const generalTab = (fields: readonly string[]) => tab('general', 'General info', 10, fields);

export const sysBOUsersUIMetadata: SysBOUIMetadata = {
  key: 'sys-users',
  list: {
    visibleFields: ['name', 'email', 'role', 'emailVerified', 'enabled'],
    filterFields: ['name', 'email', 'role'],
    sortableFields: ['name', 'email', 'role', 'emailVerified', 'enabled'],
    addAction: { visible: true, label: 'Add new' },
  },
  record: {
    tabs: [
      tab(
        'general',
        'General info',
        10,
        ['name', 'email', 'fullName', 'role', 'firstName', 'lastName', 'description', 'enabled'],
        { icon: 'info-circle', layout: 'form' },
      ),
      tab(
        'authentication',
        'Authentication',
        20,
        ['emailVerificationStatus', 'emailVerificationSource', 'emailVerifiedAt', 'localPasswordStatus', 'externalIdentities'],
        { icon: 'shield-lock', layout: 'summary' },
      ),
    ],
    fieldOverrides: {
      /*
       * `emailVerified` and `passwordChangedAt` are intentionally absent from
       * every tab, so no redundant visible:false override is needed. Canonical
       * readOnly/application-managed rules remain in SysBOUsersMetadata.
       *
       * These two calculated fields are canonical entity derivedFields; the UI
       * only decorates their already-evaluated textual values.
       */
      emailVerificationStatus: {
        presentation: {
          states: [
            { equals: 'Verified', tone: 'success' },
            { equals: 'Not verified', tone: 'secondary' },
          ],
        },
      },
      localPasswordStatus: {
        presentation: {
          states: [
            { equals: 'Configured', icon: 'check-circle-fill', tone: 'success' },
            { equals: 'Not configured', icon: 'dash-circle', tone: 'secondary' },
          ],
        },
      },

      // Shorter Authentication-tab labels and summary formatting are genuine
      // presentation overrides; canonical readOnly already controls editing.
      emailVerifiedAt: {
        label: 'Verified at',
        presentation: { mode: 'summary', format: 'datetime', emptyText: '—' },
      },
      emailVerificationSource: {
        label: 'Verification source',
        presentation: { mode: 'summary', format: 'verification-source', emptyText: '—' },
      },

      // Create-form behavior is UI-specific; persisted/entity semantics stay
      // in SysBO metadata and the API.
      enabled: { createDefaultValue: true },
    },
    relatedCollections: {
      externalIdentities: {
        label: 'External identities',
        icon: 'person-badge',
        layout: 'panel-list',
        emptyText: 'No external authentication providers are linked.',
        fields: [
          { key: 'provider', format: 'auth-provider' },
          { key: 'email' },
          {
            key: 'providerEmailVerificationStatus',
            label: 'Provider email verification',
            expression: "emailVerified == true ? 'Provider email verified' : 'Provider email not verified'",
            presentation: {
              states: [
                { equals: 'Provider email verified', tone: 'success' },
                { equals: 'Provider email not verified', tone: 'secondary' },
              ],
            },
          },
        ],
      },
    },
    entryActions: {
      delete: { kind: 'delete', visible: true, label: 'Delete entry', icon: 'trash' },
    },
  },
};

export const sysBOPrincipalsUIMetadata: SysBOUIMetadata = {
  key: 'sys-principals',
  list: {
    visibleFields: ['name', 'principalType', 'parentId', 'enabled'],
    filterFields: ['name', 'principalType'],
    sortableFields: ['name', 'principalType', 'parentId', 'enabled'],
    addAction: { visible: true, label: 'Add new' },
  },
  record: {
    tabs: [generalTab(['name', 'principalType', 'parentId', 'description', 'enabled'])],
    fieldOverrides: {},
  },
};

export const sysBOApplicationsUIMetadata: SysBOUIMetadata = {
  key: 'sys-applications',
  list: {
    visibleFields: ['name', 'appName', 'fullName', 'version', 'enabled'],
    filterFields: ['name', 'appName', 'fullName'],
    sortableFields: ['name', 'appName', 'fullName', 'version', 'enabled'],
    addAction: { visible: true, label: 'Add new' },
  },
  record: {
    tabs: [generalTab(['name', 'appName', 'fullName', 'version', 'description', 'enabled'])],
    fieldOverrides: {},
  },
};

export const sysBOLicensesUIMetadata: SysBOUIMetadata = {
  key: 'sys-licenses',
  list: {
    visibleFields: ['name', 'principalId', 'platformId', 'applicationId', 'status', 'validUntil', 'enabled'],
    filterFields: ['name', 'status'],
    sortableFields: ['name', 'principalId', 'platformId', 'applicationId', 'status', 'validUntil', 'enabled'],
    addAction: { visible: true, label: 'Add new' },
  },
  record: {
    tabs: [
      generalTab([
        'name',
        'principalId',
        'platformId',
        'applicationId',
        'licenseKey',
        'status',
        'validFrom',
        'validUntil',
        'quantity',
        'description',
        'enabled',
      ]),
    ],
    fieldOverrides: {},
  },
};

export const sysBOExtAuthProvidersUIMetadata: SysBOUIMetadata = {
  key: 'sys-ext-auth-providers',
  list: {
    visibleFields: ['provider', 'enabled', 'callbackPath', 'credentialsVerified'],
    filterFields: ['provider'],
    sortableFields: ['provider', 'enabled', 'callbackPath', 'credentialsVerified'],
    addAction: { visible: true, label: 'Add provider' },
  },
  record: {
    tabs: [
      // Current EJS intentionally does not expose the generated provider-name
      // field. Provider itself is selectable only during creation; that
      // create-vs-edit distinction is not expressible by the current contract.
      generalTab(['provider', 'callbackPath', 'tenant', 'enabled']),
      tab('secrets', 'Secrets', 20, ['clientId', 'hasClientSecret', 'secretUpdatedAt', 'credentialsVerified', 'credentialsVerifiedAt']),
    ],
    fieldOverrides: {
      // Tenant is canonically writable but this current administration form
      // intentionally presents it read-only. The remaining fields already
      // carry canonical readOnly/generated metadata and need no repetition.
      tenant: { editable: false },
    },
  },
};
