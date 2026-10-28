import {
  MANATOS_COMPANY,
  allSysBOUIMetadata,
  allSysBOMetadata,
  resolveMetadataText,
  localizeMetadataPresentation,
  type MetadataLanguage,
  type CompanyInfo,
  type SysPlatform,
  type UiPageIdentity,
} from '@manatos/shared';

export type { UiPageIdentity } from '@manatos/shared';

export const UI_HOME_PAGE = Object.freeze({
  folder: 'static',
  name: 'Home',
}) satisfies UiPageIdentity;

/** Virtual entity-list surface, rendered by framework components, not an HTML template. */
export const UI_LIST_PAGE = Object.freeze({
  folder: 'entities',
  name: 'List',
}) satisfies UiPageIdentity;

export const UI_ENTRY_PAGE = Object.freeze({
  folder: 'entities',
  name: 'Entry',
}) satisfies UiPageIdentity;

export const UI_CONFIGURATION_PAGE = Object.freeze({
  folder: 'administration',
  name: 'Configuration',
}) satisfies UiPageIdentity;

export const UI_SYSTEM_SETTINGS_PAGE = Object.freeze({
  folder: 'administration',
  name: 'SystemSettings',
}) satisfies UiPageIdentity;

export const UI_COMPANY_PAGE = Object.freeze({
  folder: 'static',
  name: 'Company',
}) satisfies UiPageIdentity;

/** Public privacy notice, including cookies and browser storage. */
export const UI_PRIVACY_PAGE = Object.freeze({
  folder: 'static',
  name: 'Privacy',
}) satisfies UiPageIdentity;

/** Public terms governing access to and use of ManatOS. */
export const UI_TERMS_PAGE = Object.freeze({
  folder: 'static',
  name: 'Terms',
}) satisfies UiPageIdentity;

export const UI_DOCUMENTATION_PAGE = Object.freeze({
  folder: 'documentation',
  name: 'DocumentationBrowser',
}) satisfies UiPageIdentity;

export const UI_NOT_FOUND_PAGE = Object.freeze({
  folder: 'static',
  name: 'NotFound',
}) satisfies UiPageIdentity;

export const UI_ERROR_PAGE = Object.freeze({
  folder: 'static',
  name: 'Error',
}) satisfies UiPageIdentity;

export interface UiTitleModel {
  readonly title: string;
  readonly icon?: string;
  readonly subtitle?: string;
}

export interface UiBreadcrumbItem {
  readonly label: string;
  readonly href: string | null;
}

export interface UiPageDetailsModel {
  readonly available: boolean;
  readonly eyebrow: string;
  readonly title: string;
  readonly message?: string;
}

export interface UiPagePresentation {
  readonly breadcrumb: readonly UiBreadcrumbItem[];
  readonly title: UiTitleModel;
  readonly details: UiPageDetailsModel;
}

export interface UiPageRoute {
  readonly path: string;
  readonly page: UiPageIdentity;
  readonly title: string;
  readonly presentation: UiPagePresentation;
  readonly platformId?: string;
  readonly entityKey?: string;
  readonly kind?: 'list' | 'entry' | 'administration';
  readonly recordId?: string;
}

export function isUiListPageRoute(
  route: UiPageRoute | null,
): route is UiPageRoute & { kind: 'list'; entityKey: string } {
  return route?.kind === 'list' && typeof route.entityKey === 'string';
}

export function isUiEntryPageRoute(
  route: UiPageRoute | null,
): route is UiPageRoute & { kind: 'entry'; entityKey: string; recordId: string } {
  return (
    route?.kind === 'entry' &&
    typeof route.entityKey === 'string' &&
    typeof route.recordId === 'string'
  );
}

export function isUiEntityPageRoute(route: UiPageRoute | null): boolean {
  return isUiListPageRoute(route) || isUiEntryPageRoute(route);
}

/** Non-public pages must not mount until the trusted UI session is verified. */
export function isUiProtectedPageRoute(route: UiPageRoute | null): boolean {
  return isUiEntityPageRoute(route) || route?.kind === 'administration';
}

const DEFAULT_PAGE_DETAILS = Object.freeze({
  available: true,
  eyebrow: 'Context',
  title: 'Details',
  message: 'Contextual page information will appear here when required.',
}) satisfies UiPageDetailsModel;

export const UI_NOT_FOUND_PAGE_PRESENTATION = Object.freeze({
  breadcrumb: Object.freeze([
    Object.freeze({ label: 'ManatOS', href: '/' }),
    Object.freeze({ label: 'Page not found', href: null }),
  ]),
  title: Object.freeze({
    title: 'Page not found',
    icon: 'bi-signpost-split',
  }),
  details: Object.freeze({
    ...DEFAULT_PAGE_DETAILS,
    available: false,
  }),
}) satisfies UiPagePresentation;

export const UI_ERROR_PAGE_PRESENTATION = Object.freeze({
  breadcrumb: Object.freeze([
    Object.freeze({ label: 'ManatOS', href: '/' }),
    Object.freeze({ label: 'Page unavailable', href: null }),
  ]),
  title: Object.freeze({
    title: 'Page unavailable',
    icon: 'bi-exclamation-triangle',
  }),
  details: Object.freeze({
    ...DEFAULT_PAGE_DETAILS,
    available: false,
  }),
}) satisfies UiPagePresentation;

function normalizePathname(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || '/';

  if (path === '/') return path;

  return path.replace(/\/+$/, '') || '/';
}

function enabledPlatform(company: CompanyInfo, platformId: string): SysPlatform | null {
  return (
    company.platforms.find((candidate) => candidate.enabled && candidate.id === platformId) ?? null
  );
}

function breadcrumb(label: string): readonly UiBreadcrumbItem[] {
  return Object.freeze([
    Object.freeze({ label: 'ManatOS', href: '/' }),
    Object.freeze({ label, href: null }),
  ]);
}

function pagePresentation(
  title: UiTitleModel,
  breadcrumbLabel: string,
  details: UiPageDetailsModel = DEFAULT_PAGE_DETAILS,
): UiPagePresentation {
  return Object.freeze({
    breadcrumb: breadcrumb(breadcrumbLabel),
    title: Object.freeze({ ...title }),
    details: Object.freeze({ ...details }),
  });
}

/** Display-only page chrome. Identity, routes and CTX remain language independent. */
function pageText(language: MetadataLanguage, en: string, el: string): string {
  return language === 'EL' ? el : en;
}

function platformRoute(
  path: string,
  platform: SysPlatform | null,
  language: MetadataLanguage,
): UiPageRoute | null {
  const page = platform?.presentation?.page;
  if (platform) platform = localizeMetadataPresentation(platform, language);

  return platform && page
    ? {
        path,
        page,
        title: platform.shortName,
        presentation: pagePresentation(
          {
            title: platform.shortName,
            icon: platform.icon ?? 'bi-boxes',
            subtitle: platform.presentation?.subtitle ?? platform.name,
          },
          `${pageText(language, 'Platform', 'Πλατφόρμα')} · ${platform.shortName}`,
        ),
        platformId: platform.id,
      }
    : null;
}

export function resolveUiPageRoute(
  pathname: string,
  company: CompanyInfo = MANATOS_COMPANY,
  language: MetadataLanguage = 'EN',
): UiPageRoute | null {
  const path = normalizePathname(pathname);

  if (path === '/') {
    return {
      path,
      page: UI_HOME_PAGE,
      title: pageText(language, 'Home', 'Αρχική'),
      presentation: pagePresentation(
        { title: pageText(language, 'Home', 'Αρχική') },
        pageText(language, 'Home', 'Αρχική'),
      ),
    };
  }

  if (path === '/system-settings') {
    return {
      path,
      page: UI_SYSTEM_SETTINGS_PAGE,
      kind: 'administration',
      title: pageText(language, 'System Settings', 'Ρυθμίσεις συστήματος'),
      presentation: pagePresentation(
        {
          title: pageText(language, 'System Settings', 'Ρυθμίσεις συστήματος'),
          icon: 'bi-database-gear',
          subtitle: pageText(
            language,
            'Storage configurations, target preparation and API diagnostics.',
            'Ρυθμίσεις αποθήκευσης, προετοιμασία στόχου και διαγνωστικά API.',
          ),
        },
        pageText(language, 'System Settings', 'Ρυθμίσεις συστήματος'),
        { ...DEFAULT_PAGE_DETAILS, available: false },
      ),
    };
  }

  if (path === '/configuration') {
    return {
      path,
      page: UI_CONFIGURATION_PAGE,
      kind: 'administration',
      title: pageText(language, 'Configuration', 'Παραμετροποίηση'),
      presentation: pagePresentation(
        {
          title: pageText(language, 'Configuration', 'Παραμετροποίηση'),
          icon: 'bi-sliders2',
          subtitle: pageText(
            language,
            'Runtime application settings. Restart-marked changes take effect after service restart.',
            'Ρυθμίσεις εφαρμογής. Οι αλλαγές με ένδειξη επανεκκίνησης ενεργοποιούνται μετά την επανεκκίνηση.',
          ),
        },
        pageText(language, 'Configuration', 'Παραμετροποίηση'),
        { ...DEFAULT_PAGE_DETAILS, available: false },
      ),
    };
  }

  if (path.startsWith('/bo/')) {
    const fragments = path.slice('/bo/'.length).split('/');
    const [entityKey, recordId] = fragments;
    const isList = fragments.length === 1;
    const isEntry =
      fragments.length === 2 &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId ?? '');
    if (entityKey && (isList || isEntry) && Object.hasOwn(allSysBOUIMetadata, entityKey)) {
      const metadata = allSysBOMetadata[entityKey as keyof typeof allSysBOMetadata];
      const label = resolveMetadataText(
        isEntry ? metadata.label : (metadata.pluralLabel ?? metadata.label),
        language,
      );
      const listLabel = resolveMetadataText(metadata.pluralLabel ?? metadata.label, language);
      return {
        path,
        page: isEntry ? UI_ENTRY_PAGE : UI_LIST_PAGE,
        title: label,
        entityKey,
        kind: isEntry ? 'entry' : 'list',
        ...(isEntry ? { recordId } : {}),
        presentation: pagePresentation(
          {
            title: label,
            icon:
              [
                ...company.navigation,
                ...company.platforms.flatMap((platform) => platform.navigation),
              ].find((item) => item.entityKey === entityKey)?.icon ?? 'bi-list-ul',
          },
          isEntry ? listLabel : label,
          {
            ...DEFAULT_PAGE_DETAILS,
            available: false,
          },
        ),
      };
    }
  }

  if (path === '/company') {
    return {
      path,
      page: UI_COMPANY_PAGE,
      title: company.name,
      presentation: pagePresentation(
        { title: pageText(language, 'Company', 'Εταιρεία') },
        pageText(language, 'Company', 'Εταιρεία'),
      ),
    };
  }

  if (path === '/privacy') {
    return {
      path,
      page: UI_PRIVACY_PAGE,
      title: pageText(language, 'Privacy', 'Απόρρητο'),
      presentation: pagePresentation(
        {
          title: pageText(language, 'Privacy & Cookies', 'Απόρρητο και Cookies'),
          icon: 'bi-shield-lock',
        },
        pageText(language, 'Privacy', 'Απόρρητο'),
        {
          ...DEFAULT_PAGE_DETAILS,
          available: false,
        },
      ),
    };
  }

  if (path === '/terms') {
    return {
      path,
      page: UI_TERMS_PAGE,
      title: pageText(language, 'Terms', 'Όροι χρήσης'),
      presentation: pagePresentation(
        {
          title: pageText(language, 'Terms of Use', 'Όροι χρήσης'),
          icon: 'bi-file-earmark-text',
        },
        pageText(language, 'Terms', 'Όροι χρήσης'),
        {
          ...DEFAULT_PAGE_DETAILS,
          available: false,
        },
      ),
    };
  }

  if (path === '/documentation') {
    return {
      path,
      page: UI_DOCUMENTATION_PAGE,
      title: pageText(language, 'Documentation', 'Τεκμηρίωση'),
      presentation: pagePresentation(
        {
          title: pageText(language, 'ManatOS Documentation', 'Τεκμηρίωση ManatOS'),
          icon: 'bi-book',
        },
        pageText(language, 'Documentation', 'Τεκμηρίωση'),
      ),
    };
  }

  if (path === '/platform') {
    return platformRoute(path, enabledPlatform(company, company.defaultPlatformId), language);
  }

  const prefix = '/platform/';

  if (!path.startsWith(prefix)) return null;

  let platformId: string;

  try {
    platformId = decodeURIComponent(path.slice(prefix.length));
  } catch {
    return null;
  }

  if (!platformId || platformId.includes('/')) return null;

  return platformRoute(path, enabledPlatform(company, platformId), language);
}

export function uiPageTitle(route: UiPageRoute): string {
  return route.title;
}

export function createUiPageContext(
  route: UiPageRoute,
  company: CompanyInfo = MANATOS_COMPANY,
  language: MetadataLanguage = 'EN',
): Readonly<Record<string, unknown>> {
  const platform = route.platformId
    ? (company.platforms.find((candidate) => candidate.id === route.platformId) ?? null)
    : null;

  return Object.freeze({
    company: localizeMetadataPresentation(company, language),
    platform: platform ? localizeMetadataPresentation(platform, language) : null,
    requestPath: route.path,
  });
}
