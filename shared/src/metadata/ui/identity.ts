import type { SysBOUIMetadata } from './types.js';
import {
  standardAddAction,
  standardEntryActions,
  systemFieldOverrides,
  systemTab,
  tab,
} from './common.js';

/** Canonical UI metadata for identity and external-authentication administration. */

export const sysBOUsersUIMetadata: SysBOUIMetadata = {
  key: 'sys-users',
  list: {
    visibleFields: ['name', 'email', 'role', 'emailVerified', 'enabled'],
    filterFields: ['name', 'email', 'role'],
    sortableFields: ['name', 'email', 'role', 'emailVerified', 'enabled'],
    addAction: standardAddAction(),
  },
  record: {
    tabs: [
      tab(
        'general',
        'General',
        10,
        [
          'name',
          'enabled',
          'email',
          'telephoneNumber',
          'description',
          'firstName',
          'lastName',
          'fullName',
          'role',
        ],
        {
          icon: 'info-circle',
          layout: 'form',
          // SysUser keeps Email directly after identity/state, then forces a generic row
          // break before its long full-width Description. The renderer remains
          // generic: ordering and row breaks are presentation metadata only.
          content: [
            { kind: 'field', field: 'name', span: 6 },
            { kind: 'field', field: 'enabled', span: 6 },
            { kind: 'field', field: 'email', span: 6 },
            { kind: 'field', field: 'telephoneNumber', span: 6 },
            { kind: 'break' },
            { kind: 'field', field: 'description', span: 12 },
            { kind: 'field', field: 'firstName', span: 6 },
            { kind: 'field', field: 'lastName', span: 6 },
            { kind: 'field', field: 'fullName', span: 6 },
            { kind: 'field', field: 'role', span: 6 },
          ],
        },
      ),
      tab(
        'authentication',
        'Authentication',
        20,
        [
          'emailVerificationStatus',
          'emailVerificationSource',
          'emailVerifiedAt',
          'localPasswordStatus',
          'externalIdentities',
        ],
        {
          icon: 'shield-lock',
          layout: 'summary',
          visible: {
            expression:
              "mode !== 'create' && (user.permissions.userRole === 'Admin' || id === user.fields.id.value)",
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
       * These two calculated fields are canonical calculated fields; the UI
       * only decorates their already-evaluated textual values.
       */
      emailVerificationStatus: {
        presentation: {
          // The canonical calculated field owns the text ("Verified"/"Not verified").
          // UI metadata owns only visual decoration; its decision is evaluator-backed.
          tone: { expression: "emailVerified ? 'success' : 'secondary'" },
        },
      },
      localPasswordStatus: {
        presentation: {
          tone: {
            expression: "mode === 'create' ? 'secondary' : hasPassword ? 'success' : 'secondary'",
          },
          icon: {
            expression:
              "mode === 'create' ? 'dash-circle' : hasPassword ? 'check-circle-fill' : 'dash-circle'",
          },
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
        presentation: { mode: 'summary', emptyText: '—' },
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
        rowIcon: 'person-badge',
        entityKey: 'external-identities',
        layout: 'panel-list',
        emptyText: 'No external authentication providers are linked.',
        fields: {
          // Provider label/icon presentation comes from the related field's
          // generic canonical optionItems catalogue.
          provider: {},
          email: {},
          providerEmailVerificationStatus: {
            // Value comes from canonical external-identities field calculation.
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
        placement: 'footer-leading',
        visible: {
          expression:
            'system.client.features.allowAdminEmailVerification && ' +
            "user.permissions.userRole === 'Admin' && " +
            'id !== user.fields.id.value && emailVerified !== true',
        },
        label: 'Verify email',
        icon: 'envelope-check',
        tone: 'success',
        emphasis: 'outline',
      },
      ...standardEntryActions,
      delete: {
        ...standardEntryActions.delete,
        enabled: { expression: 'id !== user.fields.id.value' },
        disabledReason: {
          expression:
            "id === user.fields.id.value ? 'You cannot delete your own user account.' : null",
        },
      },
    },
  },
};

export const sysBOExtAuthProvidersUIMetadata: SysBOUIMetadata = {
  key: 'sys-ext-auth-providers',
  // Entity icon remains the routed globe; entry instances use their provider
  // type icon (Microsoft/Google/Facebook/GitHub) everywhere representations render.
  entry: { icon: { mode: 'type' } },
  list: {
    visibleFields: ['provider', 'enabled', 'callbackPath', 'credentialsVerified'],
    filterFields: ['provider'],
    sortableFields: ['provider', 'enabled', 'callbackPath', 'credentialsVerified'],
    addAction: {
      ...standardAddAction('Add provider'),
      enabled: { expression: 'addConstraintReached !== true' },
      disableWhenAllEnumValuesExistForField: 'provider',
      disabledReason: 'All supported external authentication providers are already configured.',
    },
    notice: {
      tone: 'info',
      icon: 'info-circle-fill',
      title: 'One configuration record per provider.',
      text: 'Each supported external authentication provider can have at most one configuration record. Existing provider records must be edited rather than added again.',
    },
  },
  record: {
    tabs: [
      tab('general', 'General', 10, ['provider', 'enabled', 'callbackPath', 'tenant'], {
        icon: 'info-circle',
        layout: 'form',
        content: [
          { kind: 'field', field: 'provider' },
          { kind: 'field', field: 'enabled' },
          // Callback path shares its row with provider-specific Tenant when that
          // field exists; otherwise it consumes the full row. Grid-span remains
          // evaluator-backed metadata so the generic renderer/component has no
          // provider-specific layout branch.
          {
            kind: 'field',
            field: 'callbackPath',
            span: { expression: 'provider.option.tenant != null ? 6 : 12' },
          },
          { kind: 'field', field: 'tenant', span: 6 },
          {
            kind: 'component',
            span: 12,
            component: {
              key: 'contextual-help',
              readOnly: true,
              bindings: { selectedKey: { expression: 'provider.value' } },
              options: {
                itemsDataKey: 'providerDefinitions',
                itemKey: 'provider',
                contentKey: 'generalHelp',
                collapsible: true,
                initiallyCollapsed: true,
              },
            },
          },
        ],
      }),
      tab('secrets', 'Secrets', 20, [], {
        icon: 'key-fill',
        layout: 'form',
        content: [
          {
            kind: 'component',
            span: 12,
            component: { key: 'provider-credentials', readOnly: false },
          },
          {
            kind: 'component',
            span: 12,
            component: {
              key: 'contextual-help',
              readOnly: true,
              bindings: { selectedKey: { expression: 'provider.value' } },
              options: {
                itemsDataKey: 'providerDefinitions',
                itemKey: 'provider',
                contentKey: 'secretsHelp',
                collapsible: true,
                initiallyCollapsed: true,
              },
            },
          },
        ],
      }),
      systemTab(),
    ],
    fieldOverrides: {
      ...systemFieldOverrides,

      /*
       * Provider identity is selectable only while creating a configuration.
       * Existing records are one-per-provider and therefore keep that identity
       * immutable in this administration UI.
       */
      provider: {
        editable: { expression: "mode === 'create'" },
        createDefaultValue: { expression: "FirstCtx(provider.options, 'value')" },
        helpText: 'Exactly one configuration record is allowed for each supported provider.',
      },

      // Callback path is provider/application managed canonically; Tenant is
      // currently fixed by provider definitions and is presentation-readonly.
      tenant: {
        visible: { expression: 'provider.option.tenant != null' },
        editable: false,
        helpText:
          'Provider-defined tenant value. Hidden when the selected provider does not define a tenant.',
      },

      /*
       * Client ID participates in the trusted Client ID + Client secret pair.
       * Do not allow the generic field editor to mutate it independently.
       */
      clientId: { editable: false },
      callbackPath: {
        helpText:
          'Provider-defined callback path. ManatOS combines it with PUBLIC_BASE_URL; administrators cannot override it.',
      },
      enabled: { createDefaultValue: true },
      hasClientSecret: {
        label: 'Client secret',
        presentation: {
          mode: 'summary',
          icon: { expression: "hasClientSecret ? 'lock-fill' : 'lock'" },
          tone: { expression: "hasClientSecret ? 'success' : 'secondary'" },
        },
      },
      credentialsVerified: {
        presentation: {
          mode: 'summary',
          icon: { expression: "credentialsVerified ? 'check-circle-fill' : 'x-circle'" },
          tone: { expression: "credentialsVerified ? 'success' : 'secondary'" },
        },
      },

      secretUpdatedAt: {
        presentation: { mode: 'summary', format: 'datetime', emptyText: '—' },
      },
      credentialsVerifiedAt: {
        presentation: { mode: 'summary', format: 'datetime', emptyText: '—' },
      },
    },
    entryActions: standardEntryActions,
  },
};
