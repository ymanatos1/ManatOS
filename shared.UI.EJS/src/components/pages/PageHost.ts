import {
  ensureUiPageStylesheet,
  mountDocumentationBrowser,
  type DocumentationBrowserHost,
  type DocumentationLocation,
  type UiPageIdentity,
} from '@manatos/shared-ui';

export interface PageHostOptions {
  html: string;
}

export function renderPageHost(options: PageHostOptions): string {
  return `<div class="manatos-page-host" data-manatos-page-host>` + options.html + `</div>`;
}

/**
 * One application-owned content host, corresponding to NG1's mounted PageHost.
 * Translation is deliberately owned by the application (which knows its route,
 * language, and cancellation revision). This adapter owns only the live DOM and
 * the Documentation instance attached to it.
 */
export interface MountedPageHost {
  getDocumentationLocation(): DocumentationLocation | null;
  navigateDocumentation(location: DocumentationLocation): void;
  hasDocumentation(): boolean;
  present(page: UiPageIdentity, html: string, location?: DocumentationLocation | null): void;
  destroy(): void;
}

export function mountPageHost(
  scope: ParentNode = document,
  documentationLocationChanged?: (location: DocumentationLocation) => void,
): MountedPageHost {
  const content = scope.querySelector<HTMLElement>('[data-manatos-page-host]');
  if (!content) throw new Error('EJS1 PageHost is not mounted.');

  let documentationHost: DocumentationBrowserHost | null = null;
  let pendingDocumentationLocation: DocumentationLocation | null = null;
  let lastHtml: string | null = null;
  let lastPageKey: string | null = null;
  let destroyed = false;

  const mountDocumentation = (): void => {
    const documentation = content.querySelector<HTMLElement>('[data-documentation-browser]');
    if (!documentation) return;
    documentationHost = mountDocumentationBrowser(
      documentation,
      undefined,
      undefined,
      documentationLocationChanged,
    );
    if (pendingDocumentationLocation) {
      documentationHost.navigate(pendingDocumentationLocation);
      pendingDocumentationLocation = null;
    }
  };

  // Hydrate the server-rendered Documentation page without rewriting its DOM.
  mountDocumentation();

  return {
    getDocumentationLocation: () =>
      documentationHost?.getLocation() ?? pendingDocumentationLocation,
    hasDocumentation: () => documentationHost !== null,
    navigateDocumentation(location): void {
      if (destroyed) return;
      if (documentationHost) documentationHost.navigate(location);
      else pendingDocumentationLocation = location;
    },
    present(page, html, location = null): void {
      if (destroyed) return;
      const key = `${page.folder}/${page.name}`;
      // Identical source content must not remount static inputs, links, or the
      // live Documentation viewer after a redundant context notification.
      const changed = lastPageKey !== key || lastHtml !== html;
      if (changed) {
        documentationHost?.destroy();
        documentationHost = null;
        ensureUiPageStylesheet(page, content.ownerDocument);
        content.innerHTML = html;
        lastHtml = html;
        lastPageKey = key;
        pendingDocumentationLocation = location;
        mountDocumentation();
      } else if (location) {
        const current = documentationHost?.getLocation();
        if (!current || current.path !== location.path || current.anchor !== location.anchor) {
          if (documentationHost) documentationHost.navigate(location);
          else pendingDocumentationLocation = location;
        }
      }
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      documentationHost?.destroy();
      documentationHost = null;
      pendingDocumentationLocation = null;
    },
  };
}
