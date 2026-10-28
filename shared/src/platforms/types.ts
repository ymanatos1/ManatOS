import type { ManatOSDynamicValue } from '../metadata/dynamic-value.js';

/** Public asset reference used by shared Company/Platform presentation metadata. */
export interface ImageRef {
  src: string;
  alt: string;
  title?: string;
}

/** Theme-specific alternative assets for branding that changes with the UI theme. */
export interface ThemedImageRef {
  darker: ImageRef;
  lighter: ImageRef;
}

/** One navigation contribution supplied by either the Company or a Platform. */
export interface NavigationContribution {
  id: string;
  text: string;
  icon?: string;
  tooltip?: string;
  url?: string;
  action?: string;
  parentId?: string;
  order: number;
  separatorBefore?: boolean;
  dockBottom?: boolean;
  /** Static or evaluator-backed visibility against the current CTX root. */
  visible?: ManatOSDynamicValue<boolean>;
  /** An entity navigation target; the generic List route and read guard are derived from it. */
  entityKey?: string;
  requiresEntityKeys?: string[];
  /**
   * Canonical collection-read capability required before this contribution is
   * exposed. The UI receives this fact from the API AuthorizationService; the
   * navigation catalogue therefore declares a dependency without reproducing
   * role/entity policy locally.
   */
  requiresEntityRead?: string;
}

/** Reference to a reusable contribution in the owner's navigation catalogue. */
export interface NavigationReference {
  navigationId: string;
  /** Optional placement override when the same contribution is reused on a specific surface. */
  order?: number;
}

/**
 * One contribution to a concrete navigation surface.
 *
 * Reusable items reference navigation[]; surface-specific items may be declared
 * inline without entering the general navigation catalogue.
 */
export type NavigationMenuEntry = NavigationReference | NavigationContribution;

/** One subsystem selection contributed by ManatOS or the selected platform. */
export interface SubsystemSelection {
  key: string;
  selected: boolean;
}

/** Logical UI page identity. Presentation technology and physical resource extension are resolved later. */
export interface UiPageIdentity {
  folder: string;
  name: string;
}

export interface SysPlatform {
  id: string;
  code: string;
  name: string;
  shortName: string;
  /** Compact platform identity icon reused by generic shell/catalogue presentation. */
  icon?: string;
  description?: string;
  enabled: boolean;
  logo?: ImageRef;
  headerImage?: ImageRef;
  presentation?: {
    subtitle?: string;
    intro?: string;
    /** Logical landing page selected declaratively by platform metadata. */
    page?: UiPageIdentity;

    /**
     * Legacy platform stylesheet consumed by EJS0.
     * New UI page hosts derive page-family styling from pages/<folder>/Styles.css.
     * Remove when EJS0 is retired.
     */
    stylesheet?: string;

    features?: Array<{
      id: string;
      title: string;
      description: string;
      icon?: string;
    }>;
  };
  subsystems: SubsystemSelection[];
  navigation: NavigationContribution[];
  platformNavigation?: NavigationMenuEntry;
  primaryNavigation: NavigationMenuEntry[];
  workspaceNavigation: NavigationMenuEntry[];
}

/**
 * Code-defined ManatOS company catalogue.
 *
 * Company-owned capabilities are composed with one current SysPlatform at
 * runtime; product/platform definitions remain modular and source-owned.
 */
export interface CompanyInfo {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  branding: {
    /** Canonical product-positioning line used by public branding surfaces. */
    tagline: string;
    headerLogo: ThemedImageRef;
    companyPageImage?: ImageRef;
  };
  subsystems: SubsystemSelection[];
  navigation: NavigationContribution[];
  primaryNavigation: NavigationMenuEntry[];
  workspaceNavigation: NavigationMenuEntry[];
  defaultPlatformId: string;
  /** Company-owned Home-page presentation. */
  home: {
    eyebrow: string;
    title: string;
    description: string;
  };
  platforms: SysPlatform[];
}
