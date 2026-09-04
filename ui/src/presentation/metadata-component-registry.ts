/**
 * EJS implementation registry for metadata-declared reusable UI components.
 *
 * Canonical UI metadata contains semantic component keys only. This renderer
 * registry maps those keys to EJS implementations without teaching the generic
 * SysBO renderer about entity names. Browser-only components (for example
 * hierarchy-tree) intentionally have no server partial and mount from the
 * generic data-metadata-component marker instead.
 */
const componentPartials: Readonly<Record<string, string>> = {
  'information-panel': '../../common/information-panel',
  'contextual-help': '../../common/contextual-help',
  'provider-credentials': 'provider-credentials',
  'date-duration-range': '../../common/date-duration-range',
  'collection-editor': '../collections/collection-editor',
};

/** Resolve a server-rendered metadata component, or null for browser-mounted components. */
export function metadataComponentPartialFor(componentKey: string): string | null {
  return componentPartials[componentKey] ?? null;
}
