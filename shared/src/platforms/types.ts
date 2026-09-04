import type { ManatOSDynamicValue } from '../dynamic-value.js';

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
  requiresEntityKeys?: string[];
}

/** One SysBO/entity capability contributed by a Company or Platform. */
export interface EntityContribution {
  sysBOKey: string;
  description?: string;
}

/** Code-defined ManatOS platform catalogue entry. */
export interface SysPlatform {
  id: string;
  code: string;
  name: string;
  shortName: string;
  description?: string;
  enabled: boolean;
  logo?: ImageRef;
  headerImage?: ImageRef;
  presentation?: {
    subtitle?: string;
    intro?: string;
    /** Renderer asset selected declaratively by platform metadata. */
    stylesheet?: string;
    features?: Array<{
      id: string;
      title: string;
      description: string;
      icon?: string;
    }>;
  };
  entities: EntityContribution[];
  navigation: NavigationContribution[];
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
    headerLogo: ThemedImageRef;
    companyPageImage?: ImageRef;
  };
  entities: EntityContribution[];
  navigation: NavigationContribution[];
  defaultPlatformId: string;
  /** Company-owned Home-page presentation. */
  home: {
    eyebrow: string;
    title: string;
    description: string;
  };
  platforms: SysPlatform[];
}
