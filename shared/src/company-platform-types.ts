import type { SysBOUserRole } from './domain.js';
import type { ManatOSDynamicValue } from './dynamic-value.js';

/**
 * Lightweight image reference used by shared company/platform branding.
 *
 * Paths are public UI asset paths rather than filesystem paths. Keeping
 * branding references in shared metadata lets the website and future clients
 * consume the same semantic company/platform identity without duplicating
 * literal names and asset choices.
 */
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

/**
 * One navigation contribution supplied by either the company or a platform.
 *
 * Contributions are intentionally flat. `parentId` lets the UI composition
 * layer merge contributions from different owners into the same container
 * (for example Company and mCRM can both contribute children to
 * Administration or Configuration).
 */
export interface NavigationContribution {
  id: string;
  text: string;
  icon?: string;
  /** Optional action-oriented UI tooltip; clients may fall back to `text`. */
  tooltip?: string;
  url?: string;
  action?: string;
  parentId?: string;
  order: number;
  separatorBefore?: boolean;
  dockBottom?: boolean;
  /** Static or evaluator-backed visibility against the current CTX root. */
  visible?: ManatOSDynamicValue<boolean>;
  requiresAuthentication?: boolean;
  roles?: SysBOUserRole[];

  /**
   * Optional capability dependency. The item is omitted unless every named
   * SysBO is contributed by the effective Company + current Platform model.
   */
  requiresEntityKeys?: string[];

  /**
   * Platform-owned navigation/functionality may require a current entitlement
   * in addition to authentication/role checks. Admin bypass is applied by the
   * UI/API authorization layers; non-Admin access is license driven.
   */
  requiresPlatformEntitlement?: boolean;
}

/**
 * One SysBO/entity capability contributed by a company or platform.
 *
 * The actual BO metadata remains in bo-metadata.ts. This descriptor answers
 * the separate architectural question "who contributes this capability?".
 */
export interface EntityContribution {
  sysBOKey: string;
  description?: string;
}

/**
 * A code-defined ManatOS platform entity.
 *
 * SysPlatform is intentionally a first-class shared domain concept with a
 * stable identity, name and enabled state, but it is NOT a SysBOEntity:
 * SysBOEntity currently means a persisted/audited record. Platform catalogue
 * entries are product architecture owned by source code and are therefore
 * read-only rather than database-maintainable.
 */
export interface SysPlatform {
  id: string;
  code: string;
  name: string;
  shortName: string;
  description?: string;
  enabled: boolean;
  logo?: ImageRef;
  headerImage?: ImageRef;
  /** Optional platform landing-page presentation consumed by UI clients. */
  presentation?: {
    subtitle?: string;
    intro?: string;
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
