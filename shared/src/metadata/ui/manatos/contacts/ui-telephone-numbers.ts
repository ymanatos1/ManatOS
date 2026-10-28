import type { SysBOUIMetadata } from '../../types.js';
import { standardAddAction, tab } from '../../common.js';

export const sysBOTelephoneNumbersUIMetadata: SysBOUIMetadata = {
  key: 'sys-telephone-numbers',
  list: {
    common: {
      visibleFields: ['fullNumber'],
      filterFields: ['fullNumber'],
      sortableFields: ['fullNumber'],
      addAction: { ...standardAddAction('Add telephone number'), visible: false },
    },
    views: {
      main: { label: '@EN.manatos.auth.extAuthProviders.label.Standard' /* Standard */ },

      simple: {
        label: '@EN.manatos.auth.extAuthProviders.label.Simple' /* Simple */,
        visibleFields: ['fullNumber'],
      },
    },
  },
  relatedListView: 'default',
  relatedListViews: {
    default: {
      layout: 'panel-list',
      icon: 'telephone',
      emptyText: 'No telephone numbers.',
      fields: { fullNumber: {} },
    },
    compact: {
      layout: 'panel-list',
      icon: 'telephone',
      emptyText: 'No telephone numbers.',
      fields: { fullNumber: {} },
    },
  },
  defaultUIView: 'compact',
  uiViews: {
    compact: {
      viewType: 'quick',
      label: '@EN.manatos.auth.users.label.TelephoneNumber' /* Telephone number */,
    },
  },
  record: {
    tabs: [
      tab('general', 'Telephone number', 10, {
        icon: 'telephone',
        layout: 'form',
        content: [
          { kind: 'field', field: 'countryCode', span: 4 },
          { kind: 'field', field: 'number', span: 8 },
        ],
      }),
    ],
    fieldOverrides: {},
  },
};
