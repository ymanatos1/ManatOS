import type { SysBOUIMetadata } from '../../types.js';
import {
  relatedLicensesCollection,
  standardAddAction,
  standardEntryActions,
  standardQuickViewAction,
  systemFieldOverrides,
  systemTab,
  tab,
} from '../../common.js';
import { addressCountryOptions, telephoneCountryOptions } from '../contacts/common.js';

export const sysBOPrincipalsUIMetadata: SysBOUIMetadata = {
  key: 'sys-principals',

  // ---------------------------------------------------------------------------
  // COMMON ENTITY UI — shared by every SysPrincipals uiView unless overridden.
  // Entry representation and list behaviour are entity-wide presentation rules.
  // ---------------------------------------------------------------------------
  entry: {
    // Entry representation is deliberately separate from the routed entity icon.
    // Principals combine the entity cue with the semantic Principal-type cue;
    // renderers make the type icon visually dominant.
    icon: { mode: 'composed', entityScale: 0.72, typeScale: 1.15, typeEmphasis: 'primary' },
  },
  list: {
    common: {
      // Root/Parent are shown first for hierarchy scanning; `name` remains the
      // canonical primary/clickable field in the generic list renderer.
      visibleFields: ['parentId', 'rootId', 'name', 'principalType', 'enabled'],
      filterFields: ['name', 'principalType', 'parentId', 'rootId'],
      sortableFields: ['parentId', 'rootId', 'name', 'principalType', 'enabled'],
      addAction: standardAddAction(),
      pageActions: {
        addOrganization: {
          kind: 'navigate',
          order: 10,
          visible: { expression: 'permissions.create === true' },
          label: 'Add organization',
          icon: 'diagram-3',
          tone: 'primary',
          emphasis: 'solid',
          title: 'Create an organization structure',
          href: '/bo/sys-principals/hierarchy/new',
        },
      },
      rowActions: {
        quickView: standardQuickViewAction('sys-principals'),
        organization: {
          kind: 'navigate',
          order: 10,
          visible: true,
          label: 'Organization',
          icon: 'diagram-3',
          tone: 'primary',
          emphasis: 'outline',
          title: 'Open principal organization',
          href: '/bo/sys-principals/{id}/hierarchy',
        },
      },
    },
    views: {
      main: { label: 'Standard' },

      simple: {
        label: 'Simple',
        visibleFields: ['name', 'principalType'],
      },
    },
  },

  // ---------------------------------------------------------------------------
  // UI VIEWS — declarations specific to one named Principal entry presentation.
  // `main` adds nothing to the common record. `quickView` is the standard read-only
  // summary; `quick` remains the compact editable selector/workspace view.
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
                  { kind: 'field', field: 'name' },
                  { kind: 'field', field: 'principalType', representation: 'badge' },
                  { kind: 'field', field: 'enabled', representation: 'badge' },
                  { kind: 'field', field: 'firstName' },
                  { kind: 'field', field: 'lastName' },
                  { kind: 'field', field: 'description' },
                  { kind: 'field', field: 'userId', representation: 'entry-link' },
                  { kind: 'field', field: 'parentId', representation: 'entry-link' },
                  { kind: 'field', field: 'rootId', representation: 'entry-link' },
                ],
              },
              {
                kind: 'column',
                content: [{ kind: 'field', field: 'photo', representation: 'portrait' }],
              },
            ],
          }),
          tab('contact', 'Contact', 20, {
            icon: 'person-lines-fill',
            layout: 'details',
            content: [
              {
                kind: 'column',
                span: 6,
                content: [{ kind: 'collection', collection: 'emailAddresses' }],
              },
              {
                kind: 'column',
                span: 6,
                content: [{ kind: 'collection', collection: 'telephoneNumbers' }],
              },
              {
                kind: 'column',
                span: 12,
                content: [{ kind: 'collection', collection: 'addresses' }],
              },
            ],
          }),
          systemTab(),
        ],
      },
    },
    quick: {
      viewType: 'quick',
      label: 'Quick',
      record: {
        // QUICK EDITOR ONLY: one genuine entry tab/pane, with its selector hidden.
        // The popup therefore gets the ordinary EntityEntry runtime/CTX level and
        // all canonical field dependency/calculation behaviour instead of a second
        // hand-built mini-form runtime.
        tabNavigationVisible: false,
        tabs: [
          tab('quick', 'Quick', 10, {
            icon: 'lightning-charge',
            layout: 'form',
            content: [
              { kind: 'field', field: 'principalType', span: 8 },
              { kind: 'field', field: 'enabled', span: 4 },
              { kind: 'field', field: 'firstName', span: 6 },
              { kind: 'field', field: 'lastName', span: 6 },
              { kind: 'field', field: 'name', span: 12 },
            ],
          }),
        ],
        // Field policy is inherited from the canonical Principal record. The quick
        // view changes field inventory/layout only; its dedicated entry CTX level
        // makes the common reactive rules valid here without duplicate expressions.
      },
    },
  },

  // ---------------------------------------------------------------------------
  // COMMON RECORD UI — shared by both `main` and `quick` unless a selected view
  // contributes an override. The normal `main` view currently uses this unchanged.
  // ---------------------------------------------------------------------------
  record: {
    // Entry tabs / layout
    tabs: [
      tab('general', 'General', 10, {
        icon: 'info-circle',
        layout: 'form',
        /*
         * Principal uses the same generic grid-content contract as every other
         * metadata-driven form. Principal type and Enabled form the first row so Principal type is the
         * initial editable control. Person-only First/Last names occupy the next
         * row, followed by canonical Full name (`name`) and the inverse User
         * reference. Description owns a full row, while Parent and Root principal
         * remain paired on the final row without renderer/entity special cases.
         */
        content: [
          { kind: 'field', field: 'principalType', span: 5 },
          { kind: 'field', field: 'enabled', span: 3 },
          { kind: 'field', field: 'photo', span: 4 },
          { kind: 'field', field: 'firstName', span: 6 },
          { kind: 'field', field: 'lastName', span: 6 },
          { kind: 'field', field: 'name', span: 6 },
          { kind: 'field', field: 'userId', span: 6 },
          { kind: 'field', field: 'description', span: 12 },
          { kind: 'field', field: 'parentId', span: 6 },
          { kind: 'field', field: 'rootId', span: 6 },
        ],
      }),
      tab('contact', 'Contact', 20, {
        icon: 'person-lines-fill',
        layout: 'form',
        /*
         * Contact is an ordinary metadata grid rather than a one-off component
         * tab. Each contact channel declares its own span, so multiple reusable
         * collection editors can share a row and future richer contact blocks
         * can use the full width without changing the renderer.
         *
         * Planned layout:
         *   Email addresses  6  | Telephone numbers 6
         *   Main addresses  12
         */
        content: [
          {
            kind: 'component',
            span: 6,
            component: {
              key: 'collection-editor',
              options: {
                sourceKey: 'emailAddresses',
                collapsible: true,
                itemEntityKey: 'sys-email-addresses',
                relationshipEntityKey: 'sys-principal-email-addresses',
                ownerField: 'principalId',
                targetField: 'emailAddressId',
                valueField: 'address',
                fieldType: 'email',
                itemLabel: 'Email address',
                required: true,
                label: 'Email addresses',
                emptyText: 'No email addresses.',
                allowAdd: true,
                allowRemove: true,
                selectionMode: 'multiple',
                duplicateComparison: 'case-insensitive',
                duplicateText: 'This email address is already in the list.',
              },
            },
          },
          {
            kind: 'component',
            span: 6,
            component: {
              key: 'collection-editor',
              options: {
                sourceKey: 'telephoneNumbers',
                collapsible: true,
                itemEntityKey: 'sys-telephone-numbers',
                relationshipEntityKey: 'sys-principal-telephone-numbers',
                ownerField: 'principalId',
                targetField: 'telephoneNumberId',
                label: 'Telephone numbers',
                emptyText: 'No telephone numbers.',
                rowIcon: 'telephone',
                allowAdd: true,
                allowRemove: true,
                selectionMode: 'multiple',
                duplicateComparison: 'structured',
                duplicateText: 'This telephone number is already in the list.',
                identityFields: ['countryCode', 'number'],
                fieldOverrides: [
                  {
                    key: 'countryCode',
                    inputType: 'select',
                    placeholder: 'Choose country',
                    validation: 'country-code',
                    inputSpan: 5,
                    options: telephoneCountryOptions,
                  },
                  {
                    key: 'number',
                    inputType: 'tel',
                    placeholder: 'Telephone number',
                    validation: 'telephone-number',
                    normalization: 'digits',
                    inputSpan: 7,
                  },
                ],
              },
            },
          },
          {
            kind: 'component',
            span: 12,
            component: {
              key: 'collection-editor',
              options: {
                sourceKey: 'addresses',
                collapsible: true,
                itemEntityKey: 'sys-addresses',
                relationshipEntityKey: 'sys-principal-addresses',
                ownerField: 'principalId',
                targetField: 'addressId',
                label: 'Addresses',
                emptyText: 'No addresses.',
                rowIcon: 'geo-alt',
                allowAdd: true,
                allowRemove: true,
                selectionMode: 'multiple',
                duplicateComparison: 'structured',
                duplicateText: 'This address is already in the list.',
                identityFields: [
                  'recipientOrAttention',
                  'organization',
                  'addressLine1',
                  'addressLine2',
                  'addressLine3',
                  'poBox',
                  'postalCode',
                  'city',
                  'stateOrProvince',
                  'country',
                ],
                displayField: 'formattedAddress',
                fieldOverrides: [
                  {
                    key: 'recipientOrAttention',
                    inputType: 'text',
                    placeholder: 'Recipient or attention',
                    inputSpan: 6,
                  },
                  {
                    key: 'organization',
                    inputType: 'text',
                    placeholder: 'Organization',
                    inputSpan: 6,
                  },
                  {
                    key: 'addressLine1',
                    inputType: 'text',
                    placeholder: 'Street and number',
                    inputSpan: 12,
                  },
                  {
                    key: 'addressLine2',
                    inputType: 'text',
                    placeholder: 'Building, suite, unit, etc.',
                    inputSpan: 6,
                  },
                  {
                    key: 'addressLine3',
                    inputType: 'text',
                    placeholder: 'Additional address information',
                    inputSpan: 6,
                  },
                  {
                    key: 'poBox',
                    inputType: 'text',
                    placeholder: 'PO Box',
                    inputSpan: 3,
                  },
                  {
                    key: 'postalCode',
                    inputType: 'text',
                    placeholder: 'Postal code',
                    inputSpan: 3,
                  },
                  {
                    key: 'city',
                    inputType: 'text',
                    placeholder: 'City',
                    inputSpan: 3,
                  },
                  {
                    key: 'stateOrProvince',
                    inputType: 'text',
                    placeholder: 'State / province',
                    inputSpan: 3,
                  },
                  {
                    key: 'country',
                    inputType: 'select',
                    placeholder: 'Choose country',
                    inputSpan: 3,
                    options: addressCountryOptions,
                  },
                ],
              },
            },
          },
        ],
      }),
      tab('organization', 'Organization', 30, {
        icon: 'diagram-3',
        layout: 'component',
        readOnly: true,
        visible: { expression: "mode !== 'create'" },
        component: {
          key: 'hierarchy-tree',
          options: {
            dataSource: 'resources.organization.entries',
            currentSource: 'entry.current',
            idField: 'id',
            parentField: 'parentId',
            rootField: 'rootId',
            workspaceKey: 'organization',
            workspaceLabel: 'Organization',
            containerTrait: 'isContainer',
            canHaveParentTrait: 'canHaveParent',
            rootEligibleTrait: 'canBeOrganizationRoot',
            standAloneEligibleTrait: 'canStandAloneOrganization',
            viewModes: 'tree,chart',
            defaultView: 'chart',
          },
        },
      }),
      tab('licenses', 'Licenses', 800, {
        icon: 'key',
        layout: 'summary',
        visible: { expression: "mode !== 'create'" },
        content: [{ kind: 'collection', collection: 'licenses' }],
      }),
      systemTab(),
    ],

    // Field presentation / policy overrides
    fieldOverrides: {
      ...systemFieldOverrides,
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
      firstName: {
        visible: { expression: "principalType === 'Person'" },
      },
      lastName: {
        visible: { expression: "principalType === 'Person'" },
      },
      name: {
        visible: { expression: 'principalType != null' },
        editable: { expression: "principalType != null && principalType !== 'Person'" },
      },
      userId: {
        visible: { expression: "principalType === 'Person'" },
        editable: { expression: "$user.permissions.userRole === 'Admin'" },
      },
      parentId: {
        // Parentability is a separate declarative enum trait from containment: a
        // Company can contain children yet acts as a root here, while Person,
        // Group and System records may themselves belong to a parent. The evaluator reads
        // the selected enum item's canonical metadata through CTX.
        editable: {
          expression: 'principalType.option.canHaveParent === true',
        },
        readOnlyValue: null,
      },
    },

    /*
     * Standard record commands belong to the entity UI contract, while the
     * metadata-driven renderer merely renders whatever actions that contract
     * declares. Without these entries the generic form still edits fields, but
     * deliberately has no Delete/Save controls or dirty-state indicator.
     */
    // Entry commands
    entryActions: standardEntryActions,

    // Related data shown on the Principal entry
    relatedCollections: {
      licenses: relatedLicensesCollection('principalId'),
      emailAddresses: {
        label: 'Email addresses',
        icon: 'envelope',
        entityKey: 'sys-principal-email-addresses',
        relatedEntityKey: 'sys-email-addresses',
        relatedListView: 'compact',
        sourceKey: 'emailAddresses',
        source: {
          kind: 'entity-query',
          filterField: 'principalId',
          currentField: 'id',
          pageSize: 100,
        },
      },
      telephoneNumbers: {
        label: 'Telephone numbers',
        icon: 'telephone',
        entityKey: 'sys-principal-telephone-numbers',
        relatedEntityKey: 'sys-telephone-numbers',
        relatedListView: 'compact',
        sourceKey: 'telephoneNumbers',
        source: {
          kind: 'entity-query',
          filterField: 'principalId',
          currentField: 'id',
          pageSize: 100,
        },
      },
      addresses: {
        label: 'Addresses',
        icon: 'geo-alt',
        entityKey: 'sys-principal-addresses',
        relatedEntityKey: 'sys-addresses',
        relatedListView: 'compact',
        sourceKey: 'addresses',
        source: {
          kind: 'entity-query',
          filterField: 'principalId',
          currentField: 'id',
          pageSize: 100,
        },
      },
    },
  },
};

// ============================================================================
// SYS APPLICATIONS — UI
// ============================================================================
