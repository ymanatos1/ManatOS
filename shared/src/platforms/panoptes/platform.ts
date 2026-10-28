import type { SysPlatform } from '../types.js';

export const PANOPTES_PLATFORM_ID = 'panoptes';

export const PANOPTES_PLATFORM: SysPlatform = {
  id: PANOPTES_PLATFORM_ID,
  code: 'Panoptes',
  name: '@PL.Panoptes.Name' /* Panoptes Surveillance Operations */,
  shortName: '@PL.Panoptes.ShortName' /* Panoptes */,
  icon: 'bi-eye-fill',
  description:
    '@PL.Panoptes.Description' /* Surveillance operations platform for coordinating projects, operational posts and guard resources across cooperating security companies. */,
  enabled: true,

  headerImage: {
    src: '/assets/platforms/panoptes/panoptes-operations-network.png',
    alt: 'Panoptes operations network connecting security companies, surveillance posts and guard resources',
  },

  presentation: {
    page: { folder: 'static', name: 'Platform-Panoptes' },
    subtitle:
      '@PL.Panoptes.Presentation.Subtitle' /* Panoptes — Surveillance Operations on ManatOS */,
    intro:
      '@PL.Panoptes.Presentation.Intro' /* Panoptes brings surveillance projects, operational posts, staffing and guard resources into one coordinated operational environment. It supports security companies working independently or cooperatively, helping them organize coverage and respond to changing operational needs while keeping the underlying business model flexible as requirements evolve. */,

    features: [
      {
        id: 'surveillance-projects',
        title:
          '@PL.platforms.panoptes.platform.title.SurveillanceProjects' /* Surveillance Projects */,
        description:
          '@PL.Panoptes.Features.SurveillanceProjects' /* Organize security operations around projects, customers and the operational responsibilities they bring together. */,
        icon: 'bi-briefcase-fill',
      },
      {
        id: 'operational-posts',
        title: '@PL.platforms.panoptes.platform.title.OperationalPosts' /* Operational Posts */,
        description:
          '@PL.Panoptes.Features.OperationalPosts' /* Manage the locations and posts where surveillance coverage is required, together with their operational context. */,
        icon: 'bi-geo-alt-fill',
      },
      {
        id: 'guard-resources',
        title: '@PL.platforms.panoptes.platform.title.GuardResources' /* Guard Resources */,
        description:
          '@PL.Panoptes.Features.GuardResources' /* Maintain visibility of guard resources, assignments, availability and the information needed for operational planning. */,
        icon: 'bi-person-badge-fill',
      },
      {
        id: 'staffing-coverage',
        title: '@PL.platforms.panoptes.platform.title.StaffingCoverage' /* Staffing & Coverage */,
        description:
          '@PL.Panoptes.Features.StaffingCoverage' /* Plan how available resources cover operational posts and changing staffing needs across time and location. */,
        icon: 'bi-calendar-week',
      },
      {
        id: 'cooperative-operations',
        title:
          '@PL.platforms.panoptes.platform.title.CooperativeOperations' /* Cooperative Operations */,
        description:
          '@PL.Panoptes.Features.CooperativeOperations' /* Support flexible coordination between cooperating security companies when operational capacity needs to be shared or extended. */,
        icon: 'bi-diagram-3-fill',
      },
      {
        id: 'operational-awareness',
        title:
          '@PL.platforms.panoptes.platform.title.OperationalAwareness' /* Operational Awareness */,
        description:
          '@PL.Panoptes.Features.OperationalAwareness' /* Bring projects, posts, guards and current assignments together into a clearer operational picture for planning and supervision. */,
        icon: 'bi-eye-fill',
      },
    ],
  },

  subsystems: [{ key: 'surveillance', selected: true }],

  navigation: [
    {
      id: 'platform',
      text: '@PL.platforms.panoptes.platform.text.Platform' /* Platform */,
      icon: 'bi-eye-fill',
      tooltip: '@PL.Panoptes.Navigation.Open' /* Open the Panoptes platform */,
      url: '/platform/panoptes',
      order: 300,
    },
    {
      id: 'post-staffing-planner',
      text: '@PL.Panoptes.Navigation.Staffing' /* Post Staffing Planner */,
      icon: 'bi-calendar-week',
      tooltip:
        '@PL.Panoptes.Navigation.StaffingTooltip' /* Plan guard staffing for surveillance posts */,
      order: 250,
      visible: {
        expression: '$user?.permissions.platforms.panoptes?.capabilities.platformAccess ?? false',
      },
    },
    {
      id: 'guard-tracker',
      text: '@PL.Panoptes.GuardTracker' /* Guard Tracker */,
      icon: 'bi-geo-alt-fill',
      tooltip: '@PL.Panoptes.GuardAssignments' /* Track guard assignments and operational status */,
      order: 260,
      visible: {
        expression: '$user?.permissions.platforms.panoptes?.capabilities.platformAccess ?? false',
      },
    },
    {
      id: 'guards',
      parentId: 'administration',
      entityKey: 'sys-guards',
      text: '@PL.Panoptes.Guards' /* Guards */,
      icon: 'bi-person-badge-fill',
      tooltip: '@PL.Panoptes.ManageGuards' /* Manage guards */,
      order: 330,
      visible: {
        expression: '$user?.permissions.platforms.panoptes?.capabilities.platformAccess ?? false',
      },
    },
    {
      id: 'projects',
      parentId: 'administration',
      entityKey: 'sys-projects',
      text: '@PL.Panoptes.Projects' /* Projects */,
      icon: 'bi-briefcase-fill',
      tooltip: '@PL.Panoptes.ManageProjects' /* Manage surveillance projects */,
      order: 331,
      visible: {
        expression: '$user?.permissions.platforms.panoptes?.capabilities.platformAccess ?? false',
      },
    },
    {
      id: 'posts',
      parentId: 'administration',
      entityKey: 'sys-posts',
      text: '@PL.Panoptes.Posts' /* Posts */,
      icon: 'bi-geo-alt-fill',
      tooltip: '@PL.Panoptes.ManagePosts' /* Manage surveillance posts */,
      order: 332,
      visible: {
        expression: '$user?.permissions.platforms.panoptes?.capabilities.platformAccess ?? false',
      },
    },
  ],

  platformNavigation: { navigationId: 'platform' },

  primaryNavigation: [
    { navigationId: 'platform' },
    { navigationId: 'post-staffing-planner', order: 500 },
    { navigationId: 'guard-tracker', order: 510 },
  ],

  workspaceNavigation: [
    { navigationId: 'post-staffing-planner' },
    { navigationId: 'guard-tracker' },
    { navigationId: 'guards' },
    { navigationId: 'projects' },
    { navigationId: 'posts' },
  ],
};
