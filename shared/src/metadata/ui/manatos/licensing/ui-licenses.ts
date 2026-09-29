import type { SysBOUIMetadata } from '../../types.js';
import {
  standardAddAction,
  standardEntryActions,
  standardQuickViewAction,
  systemFieldOverrides,
  systemTab,
  tab,
} from '../../common.js';

export const sysBOLicensesUIMetadata: SysBOUIMetadata = {
  key: 'sys-licenses',

  // ---------------------------------------------------------------------------
  // UI VIEWS — full editor plus the standard declarative read-only Quick View.
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
                  { kind: 'field', field: 'principalId', representation: 'entry-link' },
                  { kind: 'field', field: 'status', representation: 'badge' },
                  { kind: 'field', field: 'enabled', representation: 'badge' },
                  { kind: 'field', field: 'quantity' },
                  { kind: 'field', field: 'description' },
                ],
              },
            ],
          }),
          tab('contents', 'Contents', 20, {
            icon: 'box-seam',
            layout: 'details',
            representation: 'summary',
            content: [
              {
                kind: 'column',
                content: [
                  {
                    kind: 'field',
                    field: 'validFrom',
                    label: 'Validity period',
                    representation: 'period',
                    relatedFields: ['validUntil'],
                  },
                  { kind: 'field', field: 'validityDuration' },
                  { kind: 'field', field: 'platformId' },
                  { kind: 'field', field: 'applicationId', representation: 'entry-link' },
                  { kind: 'field', field: 'rules' },
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
  relatedListView: 'default',
  relatedListViews: {
    default: {
      label: 'Default',
      layout: 'table-list',
      rowIcon: 'key',
      rowHref: '/bo/sys-licenses/{id}',
      emptyText: 'No related licenses.',
      fields: {
        name: {},
        principalId: { label: 'Customer' },
        applicationId: { label: 'Application' },
        platformId: {},
        status: {},
        validUntil: {},
        enabled: {},
      },
    },
    compact: {
      label: 'Compact',
      layout: 'table-list',
      rowIcon: 'key',
      rowHref: '/bo/sys-licenses/{id}',
      emptyText: 'No related licenses.',
      fields: { name: {}, status: {}, validUntil: {} },
    },
  },

  list: {
    common: {
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
      rowActions: {
        quickView: standardQuickViewAction('sys-licenses'),
      },
    },
    views: {
      main: { label: 'Standard' },

      simple: {
        label: 'Simple',
        visibleFields: ['name', 'status'],
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
          { kind: 'field', field: 'name' },
          { kind: 'field', field: 'enabled' },
          { kind: 'field', field: 'principalId' },
          { kind: 'field', field: 'licenseKey' },
          { kind: 'field', field: 'status' },
          { kind: 'field', field: 'quantity' },
          { kind: 'field', field: 'description', span: 12 },
        ],
      }),
      tab('contents', 'Contents', 20, {
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
      }),
      systemTab(),
    ],

    // Field presentation / policy overrides
    fieldOverrides: {
      ...systemFieldOverrides,

      /*
       * License creation defaults remain declarative and entity-agnostic at the
       * engine level. The first available reference option is selected through
       * the generic FirstCtx(...) function; an empty option collection yields
       * null. CurrentDay() supplies the current calendar day at local midnight.
       */
      name: { label: 'License name' },
    },

    // Entry commands
    entryActions: standardEntryActions,
  },
};
