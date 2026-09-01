import type { SysPlatform } from '../types.js';

/** Stable identifier used by persisted mCRM-aware records. */
export const MCRM_PLATFORM_ID = 'mcrm';

/**
 * mCRM product catalogue/presentation contribution.
 *
 * Keeping the platform definition beside the platform itself prevents the
 * generic Company catalogue from becoming a monolithic list of product-specific
 * navigation, assets and presentation metadata as new platforms are added.
 */
export const MCRM_PLATFORM: SysPlatform = {
  id: MCRM_PLATFORM_ID,
  code: 'mCRM',
  name: 'ManatOS CRM Platform',
  shortName: 'mCRM',
  description:
    'CRM platform for managing customer relationships, business activity and connected applications.',
  enabled: true,
  headerImage: {
    src: '/assets/platforms/mcrm/mcrm-customer-network.png',
    alt: 'mCRM connected customer relationship network',
  },
  presentation: {
    subtitle: 'ManatOS Dynamic Customer Relationship Management Platform',
    stylesheet: '/css/platforms/mcrm.css',
    intro:
      'mCRM is the ManatOS platform for building dynamic customer relationship management applications. Define and evolve CRM applications with configurable business models, relationships and processes; control access through licensing; test and explore them in the Playground; and prepare applications for independent delivery as they mature.',
    features: [
      {
        id: 'customer-360',
        title: 'Customer 360°',
        description: 'Unified customer view across contacts, organizations and interactions.',
        icon: 'bi-people-fill',
      },
      {
        id: 'opportunities',
        title: 'Opportunities',
        description: 'Track pipeline, manage opportunities and support business growth.',
        icon: 'bi-bullseye',
      },
      {
        id: 'activities',
        title: 'Activities',
        description: 'Plan tasks, meetings, follow-ups and reminders in one place.',
        icon: 'bi-calendar-check',
      },
      {
        id: 'communications',
        title: 'Communications',
        description: 'Keep emails, calls and messages connected to the customer context.',
        icon: 'bi-envelope-fill',
      },
      {
        id: 'documents',
        title: 'Documents',
        description: 'Store and manage documents and files related to your customers.',
        icon: 'bi-folder-fill',
      },
      {
        id: 'analytics',
        title: 'Analytics',
        description: 'Turn relationship and activity data into useful reports and insights.',
        icon: 'bi-bar-chart-fill',
      },
    ],
  },
  entities: [
    {
      sysBOKey: 'sys-applications',
      description: 'Applications designed and managed by the mCRM platform.',
    },
  ],
  navigation: [
    {
      id: 'app-playground',
      text: 'Apps Playground',
      icon: 'bi-play-circle-fill',
      url: '/app-playground',
      order: 200,
      requiresAuthentication: true,
      requiresEntityKeys: ['sys-applications'],
      requiresPlatformEntitlement: true,
    },
    {
      id: 'applications',
      parentId: 'administration',
      text: 'Applications',
      icon: 'bi-window-stack',
      url: '/bo/sys-applications',
      order: 330,
      requiresEntityKeys: ['sys-applications'],
      requiresAuthentication: true,
      requiresPlatformEntitlement: true,
    },
  ],
};
