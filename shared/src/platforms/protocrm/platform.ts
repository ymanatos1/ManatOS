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
    '@PL.protoCRM.Description' /* CRM business platform for defining customer relationships, business activity and connected applications on the ManatOS operational platform. */,
  enabled: true,
  headerImage: {
    src: '/assets/platforms/protocrm/protocrm-customer-network.png',
    alt: 'protoCRM connected customer relationship network',
  },
  presentation: {
    page: { folder: 'static', name: 'Platform-ProtoCRM' },
    stylesheet: '/css/platforms/protocrm.css',
    subtitle:
      '@PL.protoCRM.Presentation.Subtitle' /* protoCRM — Customer Relationship Management on ManatOS */,
    intro:
      '@PL.protoCRM.Presentation.Intro' /* protoCRM is a CRM platform and ManatOS application built on the ManatOS Application Foundation. It uses configurable business models, relationships and processes to shape customer-focused applications; access remains licensing-controlled, applications can be tested and explored in the Playground, and prepared for independent delivery as they mature. */,
    features: [
      {
        id: 'customer-360',
        title: '@PL.platforms.protocrm.platform.title.Customer360' /* Customer 360° */,
        description:
          '@PL.platforms.protocrm.platform.description.UnifiedCustomerViewAcrossContactsOrganizations' /* Unified customer view across contacts, organizations and interactions. */,
        icon: 'bi-people-fill',
      },
      {
        id: 'opportunities',
        title: '@PL.platforms.protocrm.platform.title.Opportunities' /* Opportunities */,
        description:
          '@PL.platforms.protocrm.platform.description.TrackPipelineManageOpportunitiesAndSupport' /* Track pipeline, manage opportunities and support business growth. */,
        icon: 'bi-bullseye',
      },
      {
        id: 'activities',
        title: '@PL.platforms.protocrm.platform.title.Activities' /* Activities */,
        description:
          '@PL.platforms.protocrm.platform.description.PlanTasksMeetingsFollowupsAndReminders' /* Plan tasks, meetings, follow-ups and reminders in one place. */,
        icon: 'bi-calendar-check',
      },
      {
        id: 'communications',
        title: '@PL.platforms.protocrm.platform.title.Communications' /* Communications */,
        description:
          '@PL.platforms.protocrm.platform.description.KeepEmailsCallsAndMessagesConnected' /* Keep emails, calls and messages connected to the customer context. */,
        icon: 'bi-envelope-fill',
      },
      {
        id: 'documents',
        title: '@PL.platforms.protocrm.platform.title.Documents' /* Documents */,
        description:
          '@PL.platforms.protocrm.platform.description.StoreAndManageDocumentsAndFiles' /* Store and manage documents and files related to your customers. */,
        icon: 'bi-folder-fill',
      },
      {
        id: 'analytics',
        title: '@PL.platforms.protocrm.platform.title.Analytics' /* Analytics */,
        description:
          '@PL.platforms.protocrm.platform.description.TurnRelationshipAndActivityDataInto' /* Turn relationship and activity data into useful reports and insights. */,
        icon: 'bi-bar-chart-fill',
      },
    ],
  },
  subsystems: [{ key: 'applications', selected: true }],
  navigation: [
    {
      id: 'platform',
      text: '@PL.platforms.protocrm.platform.text.Platform' /* Platform */,
      tooltip: '@PL.protoCRM.About' /* About the protoCRM platform */,
      icon: 'bi-boxes',
      url: '/platform/protocrm',
      order: 300,
    },
    {
      id: 'app-playground',
      text: '@PL.protoCRM.AppsPlayground' /* Apps Playground */,
      tooltip: '@PL.protoCRM.OpenAppsPlayground' /* Open the Apps Playground */,
      icon: 'bi-play-circle-fill',
      url: '/app-playground',
      order: 250,
      requiresEntityKeys: ['sys-applications'],
      requiresEntityRead: 'sys-applications',
      visible: {
        expression: '$user?.permissions.platforms.protocrm.capabilities.platformAccess ?? false',
      },
    },
    {
      id: 'applications',
      parentId: 'administration',
      text: '@PL.platforms.protocrm.platform.text.Applications' /* Applications */,
      tooltip: '@PL.protoCRM.ManageApplications' /* Manage applications */,
      icon: 'bi-window-stack',
      entityKey: 'sys-applications',
      order: 330,
    },
  ],

  platformNavigation: { navigationId: 'platform' },

  primaryNavigation: [{ navigationId: 'platform' }, { navigationId: 'app-playground', order: 500 }],

  workspaceNavigation: [{ navigationId: 'app-playground' }, { navigationId: 'applications' }],
};
