import type { SysBOUIMetadata } from '../../../types.js';
import {
  generalTab,
  relatedLicensesCollection,
  standardAddAction,
  standardEntryActions,
  standardQuickViewAction,
  systemFieldOverrides,
  systemTab,
  tab,
} from '../../../common.js';

export const sysBOApplicationsUIMetadata: SysBOUIMetadata = {
  key: 'sys-applications',

  // ---------------------------------------------------------------------------
  // UI VIEWS — full editor plus the standard declarative read-only Quick View.
  // ---------------------------------------------------------------------------
  defaultUIView: 'main',
  uiViews: {
    main: {
      viewType: 'full',
      label: '@EN.manatos.auth.extAuthProviders.label.Standard' /* Standard */,
    },
    quickView: {
      viewType: 'quick',
      label: '@EN.common.label.QuickView' /* Quick view */,
      record: {
        readOnly: true,
        tabs: [
          tab('general', '@CM.AccountGeneral', 10, {
            icon: 'info-circle',
            layout: 'details',
            representation: 'summary',
            content: [
              {
                kind: 'column',
                content: [
                  { kind: 'field', field: 'name' },
                  { kind: 'field', field: 'fullName' },
                  { kind: 'field', field: 'version' },
                  { kind: 'field', field: 'enabled', representation: 'badge' },
                  { kind: 'field', field: 'description' },
                ],
              },
            ],
          }),
          tab('licenses', 'Licenses', 800, {
            icon: 'key',
            layout: 'details',
            content: [
              { kind: 'column', content: [{ kind: 'collection', collection: 'licenses' }] },
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
  list: {
    common: {
      visibleFields: ['name', 'fullName', 'version', 'enabled'],
      filterFields: ['name', 'fullName'],
      sortableFields: ['name', 'fullName', 'version', 'enabled'],
      addAction: standardAddAction(),
      rowActions: {
        quickView: standardQuickViewAction('sys-applications'),
        play: {
          kind: 'navigate',
          order: 10,
          visible: true,
          label: '@EN.platforms.protocrm.applications.applications.label.Play' /* Play */,
          icon: 'play-fill',
          tone: 'primary',
          emphasis: 'solid',
          title:
            '@EN.platforms.protocrm.applications.applications.title.OpenApplicationPlayground' /* Open application playground */,
          href: '/bo/sys-applications/{id}/play',
        },
      },
    },
    views: {
      main: { label: '@EN.manatos.auth.extAuthProviders.label.Standard' /* Standard */ },

      simple: {
        label: '@EN.manatos.auth.extAuthProviders.label.Simple' /* Simple */,
        visibleFields: ['name', 'version'],
      },
    },
  },
  record: {
    // Entry tabs / layout
    tabs: [
      generalTab([
        { kind: 'field', field: 'name', span: 6 },
        { kind: 'field', field: 'enabled', span: 6 },
        { kind: 'field', field: 'fullName', span: 12 },
        { kind: 'field', field: 'description', span: 12 },
        { kind: 'field', field: 'version', span: 6 },
      ]),
      tab('details', 'Details', 20, {
        icon: 'card-text',
        layout: 'form',
        content: [
          { kind: 'field', field: 'details', span: 12 },
          { kind: 'field', field: 'pictures', span: 12 },
        ],
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
      pictures: {
        presentation: {
          pictureEditor: {
            maxSourceBytes: 20_000_000,
            cropAspectRatio: 1,
            cropModes: ['proportional', 'free'],
            outputSize: 1024,
            outputContentType: 'image/jpeg',
            outputQuality: 0.9,
          },
        },
      },
      details: {
        presentation: {
          /*
           * Rich-text UI policy is declarative and local to this presentation.
           * The canonical BO field remains one persisted Markdown string.
           *
           * Other useful per-field choices supported by this contract are:
           * - modes: choose any ordered subset of visual/markdown/preview;
           * - initialMode: choose the mode shown on page/popup opening;
           * - height.initial/min/max: shared geometry for every enabled mode;
           * - height.resizable: allow/forbid user vertical resizing.
           *
           * Future presentation-only candidates are documented on
           * SysBOUIRichTextPresentationMetadata in ui/types.ts rather than
           * hardcoded into entity renderers.
           */
          richText: {
            contentType: 'text/markdown',
            modes: ['markdown', 'visual', 'preview'],
            initialMode: 'markdown',
            height: {
              initial: 160,
              min: 100,
              max: 800,
              resizable: true,
            },
          },
        },
      },
    },

    // Entry commands
    entryActions: standardEntryActions,

    // Related data shown on the Application entry
    relatedCollections: {
      licenses: relatedLicensesCollection('applicationId'),
    },
  },
};

// ============================================================================
// SYS LICENSES — UI
// ============================================================================
