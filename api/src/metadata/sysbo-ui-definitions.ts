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
  options: Pick<SysBOUIRecordTabMetadata, 'icon' | 'layout' | 'visible'> = {},
): SysBOUIRecordTabMetadata => ({ id, label, order, fields, ...options });

const generalTab = (fields: readonly string[]) => tab('general', 'General', 10, fields);

const systemTab = (): SysBOUIRecordTabMetadata =>
  tab(
    'system',
    'System details',
    900,
    ['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'],
    {
      icon: 'clock-history',
      layout: 'summary',
    },
  );

const systemFieldOverrides = {
  createdAt: {
    presentation: { mode: 'summary' as const, format: 'datetime-elapsed' as const, emptyText: '—' },
  },
  updatedAt: {
    presentation: { mode: 'summary' as const, format: 'datetime-elapsed' as const, emptyText: '—' },
  },
} as const;

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
        'General',
        10,
        ['name', 'email', 'fullName', 'role', 'firstName', 'lastName', 'description', 'enabled'],
        { icon: 'info-circle', layout: 'form' },
      ),
      tab(
        'authentication',
        'Authentication',
        20,
        ['emailVerificationStatus', 'emailVerificationSource', 'emailVerifiedAt', 'localPasswordStatus', 'externalIdentities'],
        {
          icon: 'shield-lock',
          layout: 'summary',
          visible: {
            expression: "mode !== 'create' && (user.permissions.userRole === 'Admin' || id === user.fields.id.value)",
          },
        },
      ),
      systemTab(),
    ],
    fieldOverrides: {
      ...systemFieldOverrides,
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
          // The canonical derived field owns the text ("Verified"/"Not verified").
          // UI metadata owns only visual decoration; its decision is evaluator-backed.
          tone: { expression: "emailVerified ? 'success' : 'secondary'" },
        },
      },
      localPasswordStatus: {
        presentation: {
          tone: { expression: "hasPassword ? 'success' : 'secondary'" },
          icon: { expression: "hasPassword ? 'check-circle-fill' : 'dash-circle'" },
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

      // Role assignment is an authorization capability. Keep the decision in
      // evaluator-driven UI metadata instead of renderer-specific role checks.
      role: {
        editable: { expression: "user.permissions.userRole === 'Admin'" },
      },
    },
    relatedCollections: {
      externalIdentities: {
        /*
         * Related-collection contract:
         *
         * - `externalIdentities` (the parent Record key) is the UI collection
         *   identity and, because sourceKey is omitted, also the default page/CTX
         *   property holding the row array.
         * - `entityKey` identifies the canonical metadata for EACH row. External
         *   Identity is intentionally modelled as a ManatOS value-object metadata
         *   type rather than a top-level generic SysBO CRUD entity.
         * - `layout` selects the renderer's collection layout.
         * - `fields` is keyed: each key is the displayed field identity and the
         *   default row property (`sourceField ?? fieldKey`).
         * - Reusable row calculations live in the canonical related-entity
         *   metadata; UI metadata supplies only visual formatting/decoration.
         */
        label: 'External identities',
        icon: 'person-badge',
        entityKey: 'external-identities',
        layout: 'panel-list',
        emptyText: 'No external authentication providers are linked.',
        fields: {
          provider: {
            // `auth-provider` remains a pure presentation formatter.
            format: 'auth-provider',
          },
          email: {},
          providerEmailVerificationStatus: {
            // Value comes from canonical external-identities.derivedFields.
            presentation: {
              tone: { expression: "emailVerified ? 'success' : 'secondary'" },
            },
          },
        },
      },
    },
    entryActions: {
      verifyEmail: {
        kind: 'command',
        order: 10,
        command: 'verify-email',
        visible: {
          expression:
            "client.features.allowAdminEmailVerification && " +
            "user.permissions.userRole === 'Admin' && " +
            "id !== user.fields.id.value && emailVerified !== true",
        },
        label: 'Verify email',
        icon: 'envelope-check',
        tone: 'success',
        emphasis: 'outline',
      },
      delete: {
        kind: 'delete',
        order: 20,
        visible: true,
        label: 'Delete entry',
        icon: 'trash',
        tone: 'danger',
      },
      save: {
        kind: 'save',
        order: 100,
        visible: { expression: "mode !== 'view'" },
        label: 'Save',
        icon: 'check-circle',
        tone: 'primary',
      },
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
    tabs: [generalTab(['name', 'principalType', 'parentId', 'description', 'enabled']), systemTab()],
    fieldOverrides: { ...systemFieldOverrides },
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
    tabs: [generalTab(['name', 'appName', 'fullName', 'version', 'description', 'enabled']), systemTab()],
    fieldOverrides: { ...systemFieldOverrides },
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
      systemTab(),
    ],
    fieldOverrides: { ...systemFieldOverrides },
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
      systemTab(),
    ],
    fieldOverrides: {
      ...systemFieldOverrides,
      // Tenant is canonically writable but this current administration form
      // intentionally presents it read-only. The remaining fields already
      // carry canonical readOnly/generated metadata and need no repetition.
      tenant: { editable: false },
    },
  },
};
