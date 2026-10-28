import type { SysBOUIMetadata } from '../../../types.js';
import {
  generalTab,
  standardAddAction,
  standardEntryActions,
  standardQuickViewAction,
} from '../../../common.js';

/** Framework-neutral two-field management UI, shared by EJS0, NG1 and EJS1. */
export const sysBOPostsUIMetadata: SysBOUIMetadata = {
  key: 'sys-posts',
  defaultUIView: 'main',
  uiViews: {
    main: { viewType: 'full', label: '@EN.manatos.auth.extAuthProviders.label.Standard' },
    quickView: {
      viewType: 'quick',
      label: '@EN.common.label.QuickView',
      record: {
        readOnly: true,
        tabs: [
          generalTab([
            { kind: 'field', field: 'id' },
            { kind: 'field', field: 'name' },
          ]),
        ],
      },
    },
  },
  list: {
    common: {
      visibleFields: ['id', 'name'],
      filterFields: ['name'],
      sortableFields: ['name', 'id'],
      addAction: standardAddAction(),
      rowActions: { quickView: standardQuickViewAction('sys-posts') },
    },
    views: { main: { label: '@EN.manatos.auth.extAuthProviders.label.Standard' } },
  },
  record: {
    fieldOverrides: {},
    tabs: [
      generalTab([
        { kind: 'field', field: 'id' },
        { kind: 'field', field: 'name' },
      ]),
    ],
    entryActions: standardEntryActions,
  },
};
