import type { SysBOUIMetadata } from '../../types.js';
import {
  standardAddAction,
  standardEntryActions,
  standardQuickViewAction,
  systemFieldOverrides,
  systemTab,
  tab,
} from '../../common.js';

export const sysBOExtAuthProvidersUIMetadata: SysBOUIMetadata = {
  key: 'sys-ext-auth-providers',

  // ---------------------------------------------------------------------------
  // UI VIEWS — full editor plus the standard declarative read-only Quick View.
  // `main` contributes no record override, so it uses the common record below.
  // ---------------------------------------------------------------------------
  defaultUIView: 'main',
  uiViews: {
    main: {
      viewType: 'full',
      label: 'Standard',
    },
    quickView: {
      viewType: 'quick',
      label: 'Quick view',
      record: {
        readOnly: true,
        tabs: [
          tab('general', 'General', 10, {
            icon: 'info-circle',
            layout: 'details',
            representation: 'summary',
            content: [
              {
                kind: 'column',
                content: [
                  { kind: 'field', field: 'provider' },
                  { kind: 'field', field: 'enabled' },
                  { kind: 'field', field: 'callbackPath' },
                  { kind: 'field', field: 'tenant' },
                ],
              },
            ],
          }),
          tab('credentials', 'Credentials', 20, {
            icon: 'key-fill',
            layout: 'details',
            representation: 'summary',
            content: [
              {
                kind: 'column',
                content: [
                  { kind: 'field', field: 'hasClientSecret' },
                  { kind: 'field', field: 'secretUpdatedAt' },
                  { kind: 'field', field: 'credentialsVerified' },
                  { kind: 'field', field: 'credentialsVerifiedAt' },
                ],
              },
            ],
          }),
          systemTab(),
        ],
      },
    },
  },

  // ---------------------------------------------------------------------------
  // COMMON ENTITY UI — shared by all present/future uiViews unless overridden.
  // ---------------------------------------------------------------------------
  // Entity icon remains the routed globe; entry instances use their provider
  // type icon (Microsoft/Google/Facebook/GitHub) everywhere representations render.
  entry: { icon: { mode: 'type' } },
  list: {
    common: {
      visibleFields: ['provider', 'enabled', 'callbackPath', 'credentialsVerified'],
      filterFields: ['provider'],
      sortableFields: ['provider', 'enabled', 'callbackPath', 'credentialsVerified'],
      addAction: {
        ...standardAddAction('Add provider'),
        enabled: { expression: '#control.facts.addConstraintReached !== true' },
        disableWhenAllEnumValuesExistForField: 'provider',
        disabledReason: 'All supported external authentication providers are already configured.',
      },
      rowActions: {
        quickView: standardQuickViewAction('sys-ext-auth-providers'),
      },
      notice: {
        tone: 'info',
        icon: 'info-circle-fill',
        title: 'One configuration record per provider.',
        text: 'Each supported external authentication provider can have at most one configuration record. Existing provider records must be edited rather than added again.',
      },
    },
    views: {
      main: { label: 'Standard' },

      simple: {
        label: 'Simple',
        visibleFields: ['provider', 'enabled'],
      },
    },
  },
  record: {
    // Entry tabs / layout
    tabs: [
      tab('general', 'General', 10, {
        icon: 'info-circle',
        layout: 'form',
        content: [
          { kind: 'field', field: 'provider' },
          { kind: 'field', field: 'enabled' },
          // Callback path always owns a full row. Provider-specific Tenant, when
          // visible, begins on the following row; visibility remains declarative
          // while layout does not transiently resize after CTX policy evaluation.
          { kind: 'field', field: 'callbackPath', span: 12 },
          { kind: 'field', field: 'tenant', span: 6 },
          {
            kind: 'component',
            span: 12,
            component: {
              key: 'contextual-help',
              readOnly: true,
              bindings: { selectedKey: { expression: 'provider' } },
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
      tab('secrets', 'Secrets', 20, {
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
              bindings: { selectedKey: { expression: 'provider' } },
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

    // Field presentation / policy overrides
    fieldOverrides: {
      ...systemFieldOverrides,

      /*
       * Provider identity is selectable only while creating a configuration.
       * Existing records are one-per-provider and therefore keep that identity
       * immutable in this administration UI.
       */
      provider: {
        editable: { expression: "mode === 'create'" },
        helpText: 'Exactly one configuration record is allowed for each supported provider.',
      },

      // Callback path is provider/application managed canonically; Tenant is
      // currently fixed by provider definitions and is presentation-readonly.
      tenant: {
        visible: {
          expression: "provider === 'microsoft'",
        },
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
          icon: {
            expression: "credentialsVerified ? 'check-circle-fill' : 'x-circle'",
          },
          tone: {
            expression: "credentialsVerified ? 'success' : 'secondary'",
          },
        },
      },

      secretUpdatedAt: {
        presentation: { mode: 'summary', format: 'datetime-elapsed', emptyText: '—' },
      },
      credentialsVerifiedAt: {
        presentation: { mode: 'summary', format: 'datetime-elapsed', emptyText: '—' },
      },
    },

    // Entry commands
    entryActions: standardEntryActions,
  },
};
