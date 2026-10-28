import { resolveMetadataText, type MetadataLanguage } from '@manatos/shared';
import {
  applyDocumentFontScale,
  BrowserUiPageContentSource,
  normalizeUiFontScalePercent,
  UI_DOCUMENTATION_PAGE,
  ensureUiPageStylesheet,
  mountDocumentationBrowser,
  renderUiPage,
  documentationPopupState,
  type ApplicationState,
  type DocumentationBrowserHost,
  type DocumentationLocation,
  type DocumentationPopupState,
} from '@manatos/shared-ui';

import { renderFontScale } from '../preferences/FontScale.js';
import { renderFooter, type FooterOptions } from '../shell/Footer.js';
import { renderPopupTitleDocs } from '../surfaces/PopupTitleDocs.js';
import { renderSurfaceAction } from '../surfaces/SurfaceAction.js';

export interface DocumentationPopupOptions {
  fontScalePercent: number;
  language: MetadataLanguage;
  footer: FooterOptions;
}

export interface DocumentationPopupMountOptions {
  state: ApplicationState;
  initialLocation: DocumentationLocation;
  fontScalePercent: number;
  locationChanged?: (location: DocumentationLocation) => void;
  openNewRequested?: (state: DocumentationPopupState) => void;
  attachRequested?: (location: DocumentationLocation) => void;
  closeAllRequested?: () => void;
}

export interface DocumentationPopupController {
  readonly fontScalePercent: number;
  getLocation(): DocumentationLocation;
  destroy(): void;
}

export function renderDocumentationPopup(options: DocumentationPopupOptions): string {
  const localized = (key: string): string => resolveMetadataText(`@CM.${key}`, options.language);
  const actions = `
    <span data-documentation-popup-font-scale>
      ${renderFontScale({ percent: options.fontScalePercent, language: options.language })}
    </span>
    ${renderSurfaceAction({
      label: localized('OpenNewDocumentationPopup'),
      icon: 'bi-window-plus',
      action: 'open-new',
    })}
    ${renderSurfaceAction({
      label: localized('AttachDocumentation'),
      icon: 'bi-box-arrow-in-down-left',
      action: 'attach',
    })}
    ${renderSurfaceAction({
      label: localized('CloseAllDocumentationPopups'),
      icon: 'bi-x-square',
      action: 'close-all',
    })}
  `;

  return `
    <section class="documentation-popup" data-documentation-popup>
      ${renderPopupTitleDocs({
        model: { title: localized('ManatOSDocumentation'), icon: 'bi-book' },
        actions,
      })}
      <div class="documentation-popup-content" data-documentation-popup-content></div>
      ${renderFooter({ ...options.footer, interactive: false })}
    </section>
  `;
}

export function mountDocumentationPopup(
  root: HTMLElement,
  options: DocumentationPopupMountOptions,
): DocumentationPopupController {
  const content = root.querySelector<HTMLElement>('[data-documentation-popup-content]');
  const fontScaleHost = root.querySelector<HTMLElement>('[data-documentation-popup-font-scale]');
  if (!content || !fontScaleHost) throw new Error('Documentation popup host is incomplete.');

  const source = new BrowserUiPageContentSource();
  let documentationHost: DocumentationBrowserHost | null = null;
  let fontScalePercent = options.fontScalePercent;
  let destroyed = false;
  let loadRevision = 0;

  const language = (): MetadataLanguage =>
    options.state.currentLanguage.id.toUpperCase() === 'EL' ? 'EL' : 'EN';
  const localized = (key: string): string => resolveMetadataText(`@CM.${key}`, language());
  const applyFontScale = (): void => {
    applyDocumentFontScale(root.ownerDocument, fontScalePercent);
    fontScaleHost.innerHTML = renderFontScale({ percent: fontScalePercent, language: language() });
  };
  const refreshActions = (): void => {
    const heading = root.querySelector<HTMLElement>('.documentation-popup .surface-title-copy h1');
    if (heading) {
      const icon = heading.querySelector('i');
      heading.textContent = localized('ManatOSDocumentation');
      if (icon) heading.prepend(icon);
    }
    for (const [action, key] of [
      ['open-new', 'OpenNewDocumentationPopup'],
      ['attach', 'AttachDocumentation'],
      ['close-all', 'CloseAllDocumentationPopups'],
    ] as const) {
      const button = root.querySelector<HTMLButtonElement>(`[data-surface-action="${action}"]`);
      if (!button) continue;
      button.title = localized(key);
      button.setAttribute('aria-label', button.title);
    }
  };

  const currentLocation = (): DocumentationLocation =>
    documentationHost?.getLocation() ?? options.initialLocation;

  const onClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (target.closest('[data-font-scale-reset]')) {
      fontScalePercent = 100;
      applyFontScale();
      return;
    }

    const deltaValue =
      target.closest<HTMLElement>('[data-font-scale-delta]')?.dataset.fontScaleDelta;
    if (deltaValue) {
      const delta = Number(deltaValue);
      if (Number.isFinite(delta)) {
        fontScalePercent = normalizeUiFontScalePercent(fontScalePercent + delta);
        applyFontScale();
      }
      return;
    }

    const action = target.closest<HTMLElement>('[data-surface-action]')?.dataset.surfaceAction;
    if (action === 'open-new') {
      options.openNewRequested?.(documentationPopupState(currentLocation(), fontScalePercent));
    } else if (action === 'attach') {
      options.attachRequested?.(currentLocation());
    } else if (action === 'close-all') {
      options.closeAllRequested?.();
    }
  };

  root.addEventListener('click', onClick);
  applyFontScale();

  /**
   * NG1 rerenders the translated Documentation browser when language changes,
   * but retains the selected document/anchor and per-window FontScale state.
   * Each asynchronous attempt owns a revision; a late response cannot replace
   * a newer language or resurrect a popup that has already closed.
   */
  const mountBrowser = async (
    location: DocumentationLocation = currentLocation(),
  ): Promise<void> => {
    const revision = ++loadRevision;
    try {
      const html = await renderUiPage(
        source,
        UI_DOCUMENTATION_PAGE,
        Object.freeze({ $language: options.state.currentLanguage.id }),
      );
      if (destroyed || revision !== loadRevision) return;
      documentationHost?.destroy();
      documentationHost = null;
      ensureUiPageStylesheet(UI_DOCUMENTATION_PAGE, root.ownerDocument);
      content.innerHTML = html;
      const browser = content.querySelector<HTMLElement>('[data-documentation-browser]');
      if (!browser) throw new Error('Documentation popup browser content is missing.');
      documentationHost = mountDocumentationBrowser(
        browser,
        undefined,
        location,
        options.locationChanged,
      );
    } catch (error) {
      if (destroyed || revision !== loadRevision) return;
      documentationHost?.destroy();
      documentationHost = null;
      content.textContent =
        error instanceof Error ? error.message : 'Documentation could not be loaded.';
    }
  };
  const unsubscribeLanguage = options.state.subscribe((change) => {
    if (change === 'language') {
      applyFontScale();
      refreshActions();
      void mountBrowser(currentLocation());
    }
  });
  void mountBrowser();

  return {
    get fontScalePercent() {
      return fontScalePercent;
    },
    getLocation: currentLocation,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      loadRevision += 1;
      unsubscribeLanguage();
      root.removeEventListener('click', onClick);
      documentationHost?.destroy();
      documentationHost = null;
    },
  };
}
