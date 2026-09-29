import type { SysBOUIMetadata } from '../../types.js';
import { standardAddAction, tab } from '../../common.js';

export const sysBOExternalIdentitiesUIMetadata: SysBOUIMetadata = {
  key: 'external-identities',
  list: {
    common: {
      visibleFields: ['provider', 'email', 'displayName'],
      filterFields: ['provider', 'email'],
      sortableFields: ['provider', 'email'],
      addAction: { ...standardAddAction('Add external identity'), visible: false },
    },
    views: {
      main: { label: 'Standard' },

      simple: {
        label: 'Simple',
        visibleFields: ['provider', 'email'],
      },
    },
  },
  relatedListView: 'default',
  relatedListViews: {
    default: {
      label: 'Default',
      layout: 'panel-list',
      icon: 'person-badge',
      rowIcon: 'person-badge',
      emptyText: 'No external authentication providers are linked.',
      fields: {
        provider: { representation: 'badge' },
        email: {},
        providerEmailVerificationStatus: {
          presentation: { tone: { expression: "emailVerified ? 'success' : 'secondary'" } },
        },
      },
    },
    compact: {
      label: 'Compact',
      layout: 'panel-list',
      icon: 'person-badge',
      fields: { provider: {}, email: {} },
    },
  },
  defaultUIView: 'compact',
  uiViews: { compact: { viewType: 'quick', label: 'External identity' } },
  record: {
    readOnly: true,
    tabs: [
      tab('general', 'External identity', 10, {
        icon: 'person-badge',
        layout: 'details',
        representation: 'summary',
        content: [
          { kind: 'field', field: 'provider', representation: 'badge' },
          { kind: 'field', field: 'email' },
          { kind: 'field', field: 'displayName' },
          { kind: 'field', field: 'providerEmailVerificationStatus' },
        ],
      }),
    ],
    fieldOverrides: {},
  },
};
