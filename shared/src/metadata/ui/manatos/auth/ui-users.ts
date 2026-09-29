import type { SysBOUIMetadata } from '../../types.js';
import {
  standardAddAction,
  standardEntryActions,
  standardQuickViewAction,
  systemFieldOverrides,
  systemTab,
  tab,
} from '../../common.js';

export const sysBOUsersUIMetadata: SysBOUIMetadata = {
  key: 'sys-users',

  // ---------------------------------------------------------------------------
  // UI VIEWS — declarations that are specific to one named entry presentation.
  // Anything declared inside a uiView is layered on top of the common entity UI
  // metadata below. `main` currently adds nothing; `account` declares only what
  // differs for an alternative presentation of the same canonical entity record.
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
        /*
         * Generic read-only SysUser presentation. The Account route uses this
         * same uiView for the signed-in user; list Quick View will reuse it for
         * any SysUser without introducing a second presentation implementation.
         * Read-only semantics belong to the uiView, not to either host/caller.
         */
        readOnly: true,
        tabs: [
          tab('general', 'General', 10, {
            icon: 'info-circle',
            layout: 'details',
            representation: 'summary',
            /*
             * `content` is the sole field inventory for an explicitly composed
             * tab. Representations are semantic requirements; the renderer maps
             * them to technical field implementations.
             */
            content: [
              {
                kind: 'column',
                span: 6,
                content: [
                  { kind: 'field', field: 'name', representation: 'entry-link' },
                  { kind: 'field', field: 'email' },
                  { kind: 'field', field: 'role', representation: 'badge' },
                  { kind: 'field', field: 'fullName' },
                  { kind: 'field', field: 'firstName' },
                  { kind: 'field', field: 'lastName' },
                  { kind: 'field', field: 'description' },
                ],
              },
              {
                kind: 'column',
                span: 6,
                content: [{ kind: 'field', field: 'photo', representation: 'portrait' }],
              },
            ],
          }),
          tab('authentication', 'Authentication', 20, {
            icon: 'shield-lock',
            layout: 'details',
            representation: 'summary',
            content: [
              {
                kind: 'column',
                content: [
                  { kind: 'field', field: 'principalId', representation: 'entry-link' },
                  { kind: 'field', field: 'emailVerificationStatus', representation: 'badge' },
                  { kind: 'field', field: 'emailVerificationSource' },
                  { kind: 'field', field: 'emailVerifiedAt' },
                  {
                    kind: 'inline',
                    content: [
                      { kind: 'field', field: 'localPasswordStatus' },
                      { kind: 'action', action: 'setPassword' },
                      { kind: 'action', action: 'changePassword' },
                    ],
                  },
                  { kind: 'collection', collection: 'externalIdentities' },
                ],
              },
            ],
          }),
          systemTab(),
        ],
        fieldOverrides: {
          name: { label: 'User' },
          role: { label: 'Website role' },
        },
        actionOverrides: {
          setPassword: {
            visible: { expression: 'id === $user.fields.id.value && hasPassword !== true' },
          },
          changePassword: {
            visible: { expression: 'id === $user.fields.id.value && hasPassword === true' },
          },
          verifyEmail: { visible: false },
        },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // COMMON ENTITY UI — shared by every SysUsers uiView unless that uiView
  // contributes an override. This remains the normal source for list metadata,
  // common record tabs/fields/actions and reusable presentation rules.
  // ---------------------------------------------------------------------------
  list: {
    common: {
      visibleFields: ['name', 'email', 'role', 'emailVerified', 'enabled'],
      filterFields: ['name', 'email', 'role'],
      sortableFields: ['name', 'email', 'role', 'emailVerified', 'enabled'],
      addAction: standardAddAction(),
      rowActions: {
        quickView: standardQuickViewAction('sys-users'),
      },
    },
    views: {
      main: { label: 'Standard' },

      simple: {
        label: 'Simple',
        visibleFields: ['name', 'email'],
      },
    },
  },
  record: {
    // Entry tabs / layout
    tabs: [
      tab('general', 'General', 10, {
        icon: 'info-circle',
        layout: 'form',
        // SysUser keeps Email directly after identity/state, then forces a generic row
        // break before its long full-width Description. The renderer remains
        // generic: ordering and row breaks are presentation metadata only.
        content: [
          { kind: 'field', field: 'name', span: 6 },
          { kind: 'field', field: 'enabled', span: 2 },
          { kind: 'field', field: 'photo', span: 4 },
          { kind: 'field', field: 'email', span: 6 },
          { kind: 'field', field: 'telephoneNumber', span: 6 },
          { kind: 'break' },
          { kind: 'field', field: 'description', span: 12 },
          { kind: 'field', field: 'firstName', span: 6 },
          { kind: 'field', field: 'lastName', span: 6 },
          { kind: 'field', field: 'fullName', span: 6 },
          { kind: 'field', field: 'role', span: 6 },
        ],
      }),
      tab('authentication', 'Authentication', 20, {
        icon: 'shield-lock',
        layout: 'summary',
        visible: {
          expression: "mode !== 'create' && permissions.update === true",
        },
        content: [
          { kind: 'field', field: 'principalId' },
          { kind: 'field', field: 'emailVerificationStatus' },
          { kind: 'field', field: 'emailVerificationSource' },
          { kind: 'field', field: 'emailVerifiedAt' },
          { kind: 'field', field: 'localPasswordStatus' },
          { kind: 'collection', collection: 'externalIdentities' },
        ],
      }),
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
      photo: {
        presentation: {
          pictureEditor: {
            maxSourceBytes: 20_000_000,
            cropAspectRatio: 1,
            cropModes: ['proportional', 'free'],
            outputSize: 768,
            outputContentType: 'image/jpeg',
            outputQuality: 0.9,
          },
        },
      },
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
        presentation: { mode: 'summary', format: 'datetime-elapsed', emptyText: '—' },
      },
      emailVerificationSource: {
        label: 'Verification source',
        presentation: { mode: 'summary', emptyText: '—' },
      },

      // Create-form behavior is UI-specific; persisted/entity semantics stay
      // in SysBO metadata and the API.

      // Role assignment is an authorization capability. Keep the decision in
      // evaluator-driven UI metadata instead of renderer-specific role checks.
      role: {
        editable: { expression: "$user.permissions.userRole === 'Admin'" },
      },
    },

    // Related data shown on the User entry
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
        relatedListView: 'default',
      },
    },
    entryActions: {
      setPassword: {
        kind: 'navigate',
        visible: false,
        label: 'Set password',
        icon: 'key',
        tone: 'primary',
        emphasis: 'outline',
        href: '/account/password',
      },
      changePassword: {
        kind: 'navigate',
        visible: false,
        label: 'Change password',
        icon: 'key',
        tone: 'primary',
        emphasis: 'outline',
        href: '/account/password',
      },
      verifyEmail: {
        kind: 'command',
        order: 10,
        command: 'verify-email',
        placement: 'footer-leading',
        visible: {
          expression:
            '$system.client.features.allowAdminEmailVerification && ' +
            "$user.permissions.userRole === 'Admin' && " +
            'id !== $user.fields.id.value && ' +
            'emailVerified !== true',
        },
        label: 'Verify email',
        icon: 'envelope-check',
        tone: 'success',
        emphasis: 'outline',
      },
      ...standardEntryActions,
      delete: {
        ...standardEntryActions.delete,
        enabled: { expression: 'id !== $user.fields.id.value' },
        disabledReason: {
          expression:
            'id === $user.fields.id.value ' + "? 'You cannot delete your own user account.' : null",
        },
      },
    },
  },
};

// ============================================================================
// SYS EXTERNAL AUTH PROVIDERS — UI
// ============================================================================
