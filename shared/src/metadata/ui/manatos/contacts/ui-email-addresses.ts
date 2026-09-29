import type { SysBOUIMetadata } from '../../types.js';
import { standardAddAction, tab } from '../../common.js';

export const sysBOEmailAddressesUIMetadata: SysBOUIMetadata = {
  key: 'sys-email-addresses',
  list: {
    common: {
      visibleFields: ['address'],
      filterFields: ['address'],
      sortableFields: ['address'],
      addAction: { ...standardAddAction('Add email address'), visible: false },
    },
    views: {
      main: { label: 'Standard' },

      simple: {
        label: 'Simple',
        visibleFields: ['address'],
      },
    },
  },
  relatedListView: 'default',
  relatedListViews: {
    default: {
      layout: 'panel-list',
      icon: 'envelope',
      emptyText: 'No email addresses.',
      fields: { address: {} },
    },
    compact: {
      layout: 'panel-list',
      icon: 'envelope',
      emptyText: 'No email addresses.',
      fields: { address: {} },
    },
  },
  defaultUIView: 'compact',
  uiViews: { compact: { viewType: 'quick', label: 'Email address' } },
  record: {
    tabs: [
      tab('general', 'Email address', 10, {
        icon: 'envelope',
        layout: 'form',
        content: [{ kind: 'field', field: 'address', span: 12 }],
      }),
    ],
    fieldOverrides: {},
  },
};
