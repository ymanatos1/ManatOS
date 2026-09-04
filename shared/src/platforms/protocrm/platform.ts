import type { SysPlatform } from '../types.js';

/** Stable identifier used by persisted protoCRM-aware records. */
export const PROTOCRM_PLATFORM_ID = 'protocrm';

/**
 * protoCRM product catalogue/presentation contribution.
 *
 * Keeping the platform definition beside the platform itself prevents the
 * generic Company catalogue from becoming a monolithic list of product-specific
 * navigation, assets and presentation metadata as new platforms are added.
 */
export const PROTOCRM_PLATFORM: SysPlatform = {
  id: PROTOCRM_PLATFORM_ID,
  code: 'protoCRM',
  name: 'protoCRM Platform',
  shortName: 'protoCRM',
  icon: 'bi-boxes',
  description:
    'CRM platform for managing customer relationships, business activity and connected applications.',
  enabled: true,
  headerImage: {
    src: '/assets/platforms/protocrm/protocrm-customer-network.png',
    alt: 'protoCRM connected customer relationship network',
  },
  presentation: {
    subtitle: 'ManatOS protoCRM — Dynamic Customer Relationship Management Platform',
    stylesheet: '/css/platforms/protocrm.css',
    intro:
      'protoCRM is the ManatOS platform for building dynamic customer relationship management applications. Define and evolve CRM applications with configurable business models, relationships and processes; control access through licensing; test and explore them in the Playground; and prepare applications for independent delivery as they mature.',
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
      description: 'Applications designed and managed by the protoCRM platform.',
    },
  ],
  navigation: [
    {
      id: 'app-playground',
      text: 'Apps Playground',
      icon: 'bi-play-circle-fill',
      url: '/app-playground',
      order: 200,
      requiresEntityKeys: ['sys-applications'],
      visible: {
        expression: 'user.permissions.platforms.protocrm.capabilities.platformAccess === true',
      },
    },
    {
      id: 'applications',
      parentId: 'administration',
      text: 'Applications',
      icon: 'bi-window-stack',
      url: '/bo/sys-applications',
      order: 330,
      requiresEntityKeys: ['sys-applications'],
      visible: {
        expression: 'user.permissions.platforms.protocrm.capabilities.platformAccess === true',
      },
    },
  ],
};
