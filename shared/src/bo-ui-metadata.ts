import type { SysBOUIMetadata, SysBOUIRecordTabMetadata } from './bo-ui-metadata-types.js';
import { systemCountryCatalog } from './system-country-catalog.js';

export * from './bo-ui-metadata-types.js';


/** Shared projections of canonical country reference data for reusable editors. */
const telephoneCountryOptions = (() => {
  const byCallingCode = new Map<string, { label: string; value: string; flagSrc?: string }>();
  for (const country of systemCountryCatalog) {
    const existing = byCallingCode.get(country.callingCode);
    if (existing) {
      existing.label = `${existing.label} / ${country.name}`;
      continue;
    }
    byCallingCode.set(country.callingCode, {
      label: country.name,
      value: country.callingCode,
      ...(country.languageFlagSrc ? { flagSrc: country.languageFlagSrc } : {}),
    });
  }
  return [...byCallingCode.values()];
})();

const addressCountryOptions = systemCountryCatalog.map((country) => ({
  label: country.name,
  value: country.name,
  ...(country.languageFlagSrc ? { flagSrc: country.languageFlagSrc } : {}),
}));


/**
 * Framework-neutral SysBO UI metadata registry used by the metadata-driven
 * administration renderer.
 *
 * This registry is the authoritative presentation contract for generic SysBO
 * administration pages. Concrete renderers consume these semantic declarations;
 * EJS partial names, Bootstrap classes and browser-only details do not belong here.
 *
 * Specialized workflows are expressed through reusable component keys/options/
 * bindings rather than entity-specific branches in the generic page renderer.
 */
const tab = (
  id: string,
  label: string,
  order: number,
  fields: readonly string[],
  options: Partial<Pick<SysBOUIRecordTabMetadata, 'icon' | 'layout' | 'visible' | 'component' | 'content' | 'readOnly'>> = {},
): SysBOUIRecordTabMetadata => ({ id, label, order, fields, ...options });

const generalTab = (
  fields: readonly string[],
  options: Partial<Pick<SysBOUIRecordTabMetadata, 'content'>> = {},
) =>
  tab('general', 'General', 10, fields, {
    icon: 'info-circle',
    layout: 'form',
    /*
     * Keep the metadata array order authoritative all the way through the generic
     * renderer. Most General tabs use the standard two-column flow, while an
     * entity may supply explicit mixed content when it needs full-row fields or
     * other generic layout primitives. The helper owns only the default.
     */
    content: options.content
      ?? fields.map((field) => ({ kind: 'field' as const, field, span: 6 })),
  });

const standardEntryActions = {
  delete: {
    kind: 'delete' as const,
    order: 20,
    visible: true,
    placement: 'footer-leading' as const,
    label: 'Delete entry',
    icon: 'trash',
    tone: 'danger' as const,
  },
  save: {
    kind: 'save' as const,
    order: 100,
    visible: { expression: "mode !== 'view'" },
    placement: 'footer-trailing' as const,
    label: 'Save',
    icon: 'check-circle',
    tone: 'primary' as const,
  },
} as const;


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


const relatedLicensesCollection = (filterField: 'principalId' | 'applicationId') => ({
  label: 'Licenses',
  icon: 'key',
  rowIcon: 'key',
  entityKey: 'sys-licenses',
  source: {
    kind: 'entity-query' as const,
    filterField,
    currentField: 'id',
    pageSize: 100,
    sort: 'name',
    direction: 'asc' as const,
  },
  layout: 'table-list' as const,
  rowHref: '/bo/sys-licenses/{id}',
  emptyText: 'No related licenses.',
  fields: {
    name: {},
    ...(filterField === 'principalId'
      ? { applicationId: { label: 'Application' } }
      : { principalId: { label: 'Customer' } }),
    platformId: {},
    status: {},
    validUntil: {},
    enabled: {},
  },
});

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
        ['name', 'enabled', 'email', 'telephoneNumber', 'description', 'firstName', 'lastName', 'fullName', 'role'],
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
          tone: { expression: "mode === 'create' ? 'secondary' : hasPassword ? 'success' : 'secondary'" },
          icon: { expression: "mode === 'create' ? 'dash-circle' : hasPassword ? 'check-circle-fill' : 'dash-circle'" },
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
        rowIcon: 'person-badge',
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
        placement: 'footer-leading',
        visible: {
          expression:
            "system.client.features.allowAdminEmailVerification && " +
            "user.permissions.userRole === 'Admin' && " +
            "id !== user.fields.id.value && emailVerified !== true",
        },
        label: 'Verify email',
        icon: 'envelope-check',
        tone: 'success',
        emphasis: 'outline',
      },
      ...standardEntryActions,
      delete: {
        ...standardEntryActions.delete,
        enabled: { expression: "id !== user.fields.id.value" },
        disabledReason: {
          expression:
            "id === user.fields.id.value ? 'You cannot delete your own user account.' : null",
        },
      },
    },
  },
};

export const sysBOPrincipalsUIMetadata: SysBOUIMetadata = {
  key: 'sys-principals',
  list: {
    // Root/Parent are shown first for hierarchy scanning; `name` remains the
    // canonical primary/clickable field in the generic list renderer.
    visibleFields: ['parentId', 'rootPrincipalId', 'name', 'principalType', 'enabled'],
    filterFields: ['name', 'principalType', 'parentId', 'rootPrincipalId'],
    sortableFields: ['parentId', 'rootPrincipalId', 'name', 'principalType', 'enabled'],
    addAction: { visible: true, label: 'Add new' },
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
                identityFields: ['recipientOrAttention', 'organization', 'addressLine1', 'addressLine2', 'addressLine3', 'poBox', 'postalCode', 'city', 'stateOrProvince', 'country'],
                displayField: 'formattedAddress',
                itemFields: [
                  { key: 'recipientOrAttention', label: 'Recipient / attention', inputType: 'text', placeholder: 'Recipient or attention', maxLength: 160, required: false, inputSpan: 6 },
                  { key: 'organization', label: 'Organization', inputType: 'text', placeholder: 'Organization', maxLength: 180, required: false, inputSpan: 6 },
                  { key: 'addressLine1', label: 'Address line 1', inputType: 'text', placeholder: 'Street and number', maxLength: 200, required: true, inputSpan: 12 },
                  { key: 'addressLine2', label: 'Address line 2', inputType: 'text', placeholder: 'Building, suite, unit, etc.', maxLength: 200, required: false, inputSpan: 6 },
                  { key: 'addressLine3', label: 'Address line 3', inputType: 'text', placeholder: 'Additional address information', maxLength: 200, required: false, inputSpan: 6 },
                  { key: 'poBox', label: 'PO Box', inputType: 'text', placeholder: 'PO Box', maxLength: 80, required: false, inputSpan: 3 },
                  { key: 'postalCode', label: 'Postal code', inputType: 'text', placeholder: 'Postal code', maxLength: 40, required: false, inputSpan: 3 },
                  { key: 'city', label: 'City', inputType: 'text', placeholder: 'City', maxLength: 120, required: true, inputSpan: 3 },
                  { key: 'stateOrProvince', label: 'State / province', inputType: 'text', placeholder: 'State / province', maxLength: 120, required: false, inputSpan: 3 },
                  { key: 'country', label: 'Country', inputType: 'select', placeholder: 'Choose country', maxLength: 120, required: true, inputSpan: 3, options: addressCountryOptions },
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
            dataSource: 'dataList',
            currentSource: 'dataCurrent',
            idField: 'id',
            parentField: 'parentId',
            rootField: 'rootPrincipalId',
            labelField: 'name',
            typeField: 'principalType',
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
        // Company can contain children yet acts as a root here, while Person and
        // Group records may themselves belong to a parent. The evaluator reads
        // the selected enum item's canonical metadata through CTX.
        editable: { expression: 'principalType.option != null && principalType.option.canHaveParent === true' },
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
        source: { kind: 'entity-query', filterField: 'principalId', currentField: 'id', pageSize: 100 },
        fields: { emailAddressId: {} },
      },
      telephoneNumbers: {
        label: 'Telephone numbers',
        icon: 'telephone',
        entityKey: 'sys-principal-telephone-numbers',
        sourceKey: 'telephoneNumbers',
        layout: 'panel-list',
        source: { kind: 'entity-query', filterField: 'principalId', currentField: 'id', pageSize: 100 },
        fields: { telephoneNumberId: {} },
      },
      addresses: {
        label: 'Addresses',
        icon: 'geo-alt',
        entityKey: 'sys-principal-addresses',
        sourceKey: 'addresses',
        layout: 'panel-list',
        source: { kind: 'entity-query', filterField: 'principalId', currentField: 'id', pageSize: 100 },
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
    addAction: { visible: true, label: 'Add new' },
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
      generalTab(
        ['name', 'enabled', 'fullName', 'description', 'version'],
        {
          content: [
            { kind: 'field', field: 'name', span: 6 },
            { kind: 'field', field: 'enabled', span: 6 },
            { kind: 'field', field: 'fullName', span: 12 },
            { kind: 'field', field: 'description', span: 12 },
            { kind: 'field', field: 'version', span: 6 },
          ],
        },
      ),
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
    visibleFields: ['name', 'principalId', 'platformId', 'applicationId', 'status', 'validUntil', 'enabled'],
    filterFields: ['name', 'principalId', 'platformId', 'applicationId', 'status', 'enabled'],
    sortableFields: ['name', 'principalId', 'platformId', 'applicationId', 'status', 'validUntil', 'enabled'],
    addAction: { visible: true, label: 'Add new' },
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
          'principalId',
          'licenseKey',
          'status',
          'quantity',
          'description',
        ],
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

export const sysBOExtAuthProvidersUIMetadata: SysBOUIMetadata = {
  key: 'sys-ext-auth-providers',
  list: {
    visibleFields: ['provider', 'enabled', 'callbackPath', 'credentialsVerified'],
    filterFields: ['provider'],
    sortableFields: ['provider', 'enabled', 'callbackPath', 'credentialsVerified'],
    addAction: {
      visible: true,
      label: 'Add provider',
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
          { kind: 'field', field: 'callbackPath', span: { expression: "provider.option.tenant != null ? 6 : 12" } },
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
        helpText: "Provider-defined tenant value. Hidden when the selected provider does not define a tenant.",
      },

      /*
       * Client ID participates in the trusted Client ID + Client secret pair.
       * Do not allow the generic field editor to mutate it independently.
       */
      clientId: { editable: false },
      callbackPath: {
        helpText: 'Provider-defined callback path. ManatOS combines it with PUBLIC_BASE_URL; administrators cannot override it.',
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
