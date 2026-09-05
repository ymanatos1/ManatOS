import type { SysBOUIMetadata } from './types.js';
import {
  addressCountryOptions,
  generalTab,
  relatedLicensesCollection,
  standardAddAction,
  standardEntryActions,
  systemFieldOverrides,
  systemTab,
  tab,
  telephoneCountryOptions,
} from './common.js';

/** Canonical UI metadata for Company/business SysBOs. */

export const sysBOPrincipalsUIMetadata: SysBOUIMetadata = {
  key: 'sys-principals',
  entry: {
    // Entry representation is deliberately separate from the routed entity icon.
    // Principals combine the entity cue with the semantic Principal-type cue;
    // renderers make the type icon visually dominant.
    icon: { mode: 'composed', entityScale: 0.72, typeScale: 1.15, typeEmphasis: 'primary' },
  },
  list: {
    // Root/Parent are shown first for hierarchy scanning; `name` remains the
    // canonical primary/clickable field in the generic list renderer.
    visibleFields: ['parentId', 'rootPrincipalId', 'name', 'principalType', 'enabled'],
    filterFields: ['name', 'principalType', 'parentId', 'rootPrincipalId'],
    sortableFields: ['parentId', 'rootPrincipalId', 'name', 'principalType', 'enabled'],
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
  recordQuick: {
    // Compact owner-managed Principal editor used by generic aggregate workspaces.
    // Relationship fields are supplied by the owning hierarchy operation; the
    // calculated root remains evaluator-owned and is never manually entered.
    content: [
      { kind: 'field', field: 'name', span: 12 },
      { kind: 'field', field: 'principalType', span: 8 },
      { kind: 'field', field: 'enabled', span: 4 },
    ],
    fieldOverrides: {
      // A newly sketched Principal starts enabled just like the full create form.
      enabled: { createDefaultValue: true },
      // Principal type has one canonical create default across full and quick records.
      // Keeping both surfaces aligned avoids owner/editor-specific creation semantics.
      principalType: { createDefaultValue: 'Person' },
    },
  },
  record: {
    tabs: [
      tab(
        'general',
        'General',
        10,
        ['name', 'enabled', 'description', 'principalType', 'parentId', 'rootPrincipalId'],
        {
          icon: 'info-circle',
          layout: 'form',
          /*
           * Principal uses the same generic grid-content contract as every other
           * metadata-driven form. The spacer reserves the second half of the
           * Principal type row so Parent principal and Root principal start
           * together on the following row without renderer/entity special cases.
           */
          content: [
            { kind: 'field', field: 'name', span: 6 },
            { kind: 'field', field: 'enabled', span: 6 },
            { kind: 'field', field: 'description', span: 12 },
            { kind: 'field', field: 'principalType', span: 6 },
            { kind: 'spacer', span: 6 },
            { kind: 'field', field: 'parentId', span: 6 },
            { kind: 'field', field: 'rootPrincipalId', span: 6 },
          ],
        },
      ),
      tab('contact', 'Contact', 20, [], {
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
                itemFields: [
                  {
                    key: 'countryCode',
                    label: 'Country code',
                    inputType: 'select',
                    placeholder: 'Choose country',
                    validation: 'country-code',
                    required: true,
                    inputSpan: 5,
                    options: telephoneCountryOptions,
                  },
                  {
                    key: 'number',
                    label: 'Telephone number',
                    inputType: 'tel',
                    placeholder: 'Telephone number',
                    maxLength: 40,
                    validation: 'telephone-number',
                    normalization: 'digits',
                    required: true,
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
                itemFields: [
                  {
                    key: 'recipientOrAttention',
                    label: 'Recipient / attention',
                    inputType: 'text',
                    placeholder: 'Recipient or attention',
                    maxLength: 160,
                    required: false,
                    inputSpan: 6,
                  },
                  {
                    key: 'organization',
                    label: 'Organization',
                    inputType: 'text',
                    placeholder: 'Organization',
                    maxLength: 180,
                    required: false,
                    inputSpan: 6,
                  },
                  {
                    key: 'addressLine1',
                    label: 'Address line 1',
                    inputType: 'text',
                    placeholder: 'Street and number',
                    maxLength: 200,
                    required: true,
                    inputSpan: 12,
                  },
                  {
                    key: 'addressLine2',
                    label: 'Address line 2',
                    inputType: 'text',
                    placeholder: 'Building, suite, unit, etc.',
                    maxLength: 200,
                    required: false,
                    inputSpan: 6,
                  },
                  {
                    key: 'addressLine3',
                    label: 'Address line 3',
                    inputType: 'text',
                    placeholder: 'Additional address information',
                    maxLength: 200,
                    required: false,
                    inputSpan: 6,
                  },
                  {
                    key: 'poBox',
                    label: 'PO Box',
                    inputType: 'text',
                    placeholder: 'PO Box',
                    maxLength: 80,
                    required: false,
                    inputSpan: 3,
                  },
                  {
                    key: 'postalCode',
                    label: 'Postal code',
                    inputType: 'text',
                    placeholder: 'Postal code',
                    maxLength: 40,
                    required: false,
                    inputSpan: 3,
                  },
                  {
                    key: 'city',
                    label: 'City',
                    inputType: 'text',
                    placeholder: 'City',
                    maxLength: 120,
                    required: true,
                    inputSpan: 3,
                  },
                  {
                    key: 'stateOrProvince',
                    label: 'State / province',
                    inputType: 'text',
                    placeholder: 'State / province',
                    maxLength: 120,
                    required: false,
                    inputSpan: 3,
                  },
                  {
                    key: 'country',
                    label: 'Country',
                    inputType: 'select',
                    placeholder: 'Choose country',
                    maxLength: 120,
                    required: true,
                    inputSpan: 3,
                    options: addressCountryOptions,
                  },
                ],
              },
            },
          },
        ],
      }),
      tab('organization', 'Organization', 30, [], {
        icon: 'diagram-3',
        layout: 'component',
        readOnly: true,
        visible: { expression: "mode !== 'create'" },
        component: {
          key: 'hierarchy-tree',
          options: {
            dataSource: 'entries',
            currentSource: 'entry',
            idField: 'id',
            parentField: 'parentId',
            rootField: 'rootPrincipalId',
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
      tab('licenses', 'Licenses', 800, ['licenses'], {
        icon: 'key',
        layout: 'summary',
        visible: { expression: "mode !== 'create'" },
      }),
      systemTab(),
    ],
    fieldOverrides: {
      ...systemFieldOverrides,
      enabled: { createDefaultValue: true },
      principalType: {
        // Seed the create CTX itself, not merely the visible select. This means
        // principalType.option is decorated from canonical enumItems before any
        // dependent editability expression is evaluated.
        createDefaultValue: 'Person',
      },
      parentId: {
        // Parentability is a separate declarative enum trait from containment: a
        // Company can contain children yet acts as a root here, while Person,
        // Group and System records may themselves belong to a parent. The evaluator reads
        // the selected enum item's canonical metadata through CTX.
        editable: {
          expression: 'principalType.option != null && principalType.option.canHaveParent === true',
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
    entryActions: standardEntryActions,
    relatedCollections: {
      licenses: relatedLicensesCollection('principalId'),
      emailAddresses: {
        label: 'Email addresses',
        icon: 'envelope',
        entityKey: 'sys-principal-email-addresses',
        sourceKey: 'emailAddresses',
        // Required read/presentation shape for the related source. The Contact
        // tab's collection-editor owns edit semantics; this layout simply keeps
        // the canonical related-collection contract complete and generic.
        layout: 'panel-list',
        source: {
          kind: 'entity-query',
          filterField: 'principalId',
          currentField: 'id',
          pageSize: 100,
        },
        fields: { emailAddressId: {} },
      },
      telephoneNumbers: {
        label: 'Telephone numbers',
        icon: 'telephone',
        entityKey: 'sys-principal-telephone-numbers',
        sourceKey: 'telephoneNumbers',
        layout: 'panel-list',
        source: {
          kind: 'entity-query',
          filterField: 'principalId',
          currentField: 'id',
          pageSize: 100,
        },
        fields: { telephoneNumberId: {} },
      },
      addresses: {
        label: 'Addresses',
        icon: 'geo-alt',
        entityKey: 'sys-principal-addresses',
        sourceKey: 'addresses',
        layout: 'panel-list',
        source: {
          kind: 'entity-query',
          filterField: 'principalId',
          currentField: 'id',
          pageSize: 100,
        },
        fields: { addressId: {} },
      },
    },
  },
};

export const sysBOApplicationsUIMetadata: SysBOUIMetadata = {
  key: 'sys-applications',
  list: {
    visibleFields: ['name', 'fullName', 'version', 'enabled'],
    filterFields: ['name', 'fullName'],
    sortableFields: ['name', 'fullName', 'version', 'enabled'],
    addAction: standardAddAction(),
    rowActions: {
      play: {
        kind: 'navigate',
        order: 10,
        visible: true,
        label: 'Play',
        icon: 'play-fill',
        tone: 'primary',
        emphasis: 'solid',
        title: 'Open application playground',
        href: '/bo/sys-applications/{id}/play',
      },
    },
  },
  record: {
    tabs: [
      generalTab(['name', 'enabled', 'fullName', 'description', 'version'], {
        content: [
          { kind: 'field', field: 'name', span: 6 },
          { kind: 'field', field: 'enabled', span: 6 },
          { kind: 'field', field: 'fullName', span: 12 },
          { kind: 'field', field: 'description', span: 12 },
          { kind: 'field', field: 'version', span: 6 },
        ],
      }),
      tab('licenses', 'Licenses', 800, ['licenses'], {
        icon: 'key',
        layout: 'summary',
        visible: { expression: "mode !== 'create'" },
      }),
      systemTab(),
    ],
    fieldOverrides: {
      ...systemFieldOverrides,
      enabled: { createDefaultValue: true },
    },
    entryActions: standardEntryActions,
    relatedCollections: {
      licenses: relatedLicensesCollection('applicationId'),
    },
  },
};

export const sysBOLicensesUIMetadata: SysBOUIMetadata = {
  key: 'sys-licenses',
  list: {
    visibleFields: [
      'name',
      'principalId',
      'platformId',
      'applicationId',
      'status',
      'validUntil',
      'enabled',
    ],
    filterFields: ['name', 'principalId', 'platformId', 'applicationId', 'status', 'enabled'],
    sortableFields: [
      'name',
      'principalId',
      'platformId',
      'applicationId',
      'status',
      'validUntil',
      'enabled',
    ],
    addAction: standardAddAction(),
  },
  record: {
    tabs: [
      tab(
        'general',
        'General',
        10,
        ['name', 'enabled', 'principalId', 'licenseKey', 'status', 'quantity', 'description'],
        {
          icon: 'info-circle',
          layout: 'form',
          content: [
            { kind: 'field', field: 'name' },
            { kind: 'field', field: 'enabled' },
            { kind: 'field', field: 'principalId' },
            { kind: 'field', field: 'licenseKey' },
            { kind: 'field', field: 'status' },
            { kind: 'field', field: 'quantity' },
            { kind: 'field', field: 'description', span: 12 },
          ],
        },
      ),
      tab(
        'contents',
        'Contents',
        20,
        ['validFrom', 'validityDuration', 'validUntil', 'platformId', 'applicationId', 'rules'],
        {
          icon: 'box-seam',
          layout: 'form',
          /*
           * License validity is one reusable composite concern. Keep its three
           * canonical fields together and place the component first in Contents
           * without teaching the generic renderer anything License-specific.
           */
          content: [
            {
              kind: 'component',
              span: 12,
              component: {
                key: 'date-duration-range',
                readOnly: false,
                options: {
                  startField: 'validFrom',
                  durationField: 'validityDuration',
                  endField: 'validUntil',
                },
              },
            },
            { kind: 'field', field: 'platformId' },
            { kind: 'field', field: 'applicationId' },
            { kind: 'field', field: 'rules' },
          ],
        },
      ),
      systemTab(),
    ],
    fieldOverrides: {
      ...systemFieldOverrides,

      /*
       * License creation defaults remain declarative and entity-agnostic at the
       * engine level. The first available reference option is selected through
       * the generic FirstCtx(...) function; an empty option collection yields
       * null. CurrentDay() supplies the current calendar day at local midnight.
       */
      name: { label: 'License name' },
      platformId: { createDefaultValue: { expression: "FirstCtx(platformId.options, 'value')" } },
      status: { createDefaultValue: 'Active' },
      validFrom: { createDefaultValue: { expression: 'CurrentDay()' } },
      quantity: { createDefaultValue: 1 },
      enabled: { createDefaultValue: true },
    },
    entryActions: standardEntryActions,
  },
};
