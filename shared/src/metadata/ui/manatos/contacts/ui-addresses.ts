import type { SysBOUIMetadata } from '../../types.js';
import { standardAddAction, tab } from '../../common.js';

export const sysBOAddressesUIMetadata: SysBOUIMetadata = {
  key: 'sys-addresses',
  entry: { icon: { mode: 'entity' } },
  list: {
    common: {
      visibleFields: ['formattedAddress', 'city', 'country'],
      filterFields: ['formattedAddress', 'city', 'country'],
      sortableFields: ['formattedAddress', 'city', 'country'],
      addAction: { ...standardAddAction('Add address'), visible: false },
    },
    views: {
      main: { label: 'Standard' },

      simple: {
        label: 'Simple',
        visibleFields: ['formattedAddress'],
      },
    },
  },
  relatedListView: 'default',
  relatedListViews: {
    default: {
      layout: 'panel-list',
      icon: 'geo-alt',
      emptyText: 'No addresses.',
      fields: { formattedAddress: {} },
    },
    compact: {
      layout: 'panel-list',
      icon: 'geo-alt',
      fields: { formattedAddress: {} },
    },
  },
  defaultUIView: 'compact',
  uiViews: {
    compact: { viewType: 'quick', label: 'Address' },
  },
  record: {
    tabs: [
      tab('general', 'Address', 10, {
        icon: 'geo-alt',
        layout: 'form',
        content: [
          { kind: 'field', field: 'recipientOrAttention', span: 6 },
          { kind: 'field', field: 'organization', span: 6 },
          { kind: 'field', field: 'addressLine1', span: 12 },
          { kind: 'field', field: 'addressLine2', span: 12 },
          { kind: 'field', field: 'addressLine3', span: 12 },
          { kind: 'field', field: 'poBox', span: 4 },
          { kind: 'field', field: 'postalCode', span: 4 },
          { kind: 'field', field: 'city', span: 4 },
          { kind: 'field', field: 'stateOrProvince', span: 6 },
          { kind: 'field', field: 'country', span: 6 },
        ],
      }),
    ],
    fieldOverrides: {},
  },
};
