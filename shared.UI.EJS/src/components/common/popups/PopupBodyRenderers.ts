/** UIS boundary: The registry selects body-specific native presenters and credentials policy; the PopupBase host only mounts and manages lifetimes. This ownership separation is intentional; preserve it in future migrations. */
/**
 * EJS Popup body capability registry.
 * Each presenter owns its markup and presentation refresh; the popup host only
 * mounts views, routes native events and manages the Surface lifetime.
 * Popup IDs never select a body renderer; definitions declare a capability.
 */
import {
  type UiPopupPresentation,
  type UiPopupTabDefinition,
  type UiChangeReport,
  UiPopupRuntime,
  type UiPageTemplateContext,
} from '@manatos/shared-ui';
import { AuthPopupContent } from '../../auth/AuthPopupContent.js';
import {
  authCredentialReader,
  type PopupCredentialReader,
} from '../../auth/AuthCredentialAccess.js';
import { MessagePopupContent } from './MessagePopupContent.js';
import { renderHierarchicalReport } from '../change-report/HierarchicalReport.js';

export interface PopupBodyRenderContext {
  readonly root: HTMLElement;
  readonly runtime: UiPopupRuntime;
  readonly tab: UiPopupTabDefinition;
  readonly inputs: Map<string, HTMLInputElement>;
  readonly render: () => void;
  readonly reconcile: () => void;
}
export interface PopupBodyRenderer {
  mount(context: PopupBodyRenderContext): void;
  readonly credentials?: PopupCredentialReader;
  update?(root: HTMLElement, runtime: UiPopupRuntime): void;
  refreshLanguage?(
    root: HTMLElement,
    runtime: UiPopupRuntime,
    language: 'EN' | 'EL',
    reconcile: (tabId: string) => void,
  ): void;
}
export type PopupBodyKind = NonNullable<UiPopupPresentation['content']>;
export class PopupBodyRendererRegistry {
  private readonly renderers = new Map<PopupBodyKind, PopupBodyRenderer>();
  register(kind: PopupBodyKind, renderer: PopupBodyRenderer): this {
    if (this.renderers.has(kind)) throw new Error(`Duplicate popup body renderer: ${kind}`);
    this.renderers.set(kind, renderer);
    return this;
  }
  resolve(kind: PopupBodyKind): PopupBodyRenderer {
    const renderer = this.renderers.get(kind);
    if (!renderer) throw new Error(`Unregistered popup body renderer: ${kind}`);
    return renderer;
  }
}

/** Standalone popup contents and multi-view Auth share the same body policy. */
export function createPopupBodyRenderers(
  language: () => 'EN' | 'EL',
  pageContext: () => UiPageTemplateContext,
): PopupBodyRendererRegistry {
  // Feature-specific presenters are constructed in the registry factory,
  // never by the generic modal/CTX host.
  const auth = new AuthPopupContent(language, pageContext);
  const message = new MessagePopupContent(language);
  return new PopupBodyRendererRegistry()
    .register('standard', {
      mount({ root, tab, runtime, inputs, render, reconcile }) {
        const body = document.createElement('div');
        body.className = 'sign-in-body';
        root.append(body);
        const sectionHost = document.createElement('div');
        const methods = tab.id === 'signin' || tab.id === 'methods';
        sectionHost.className = methods ? 'auth-methods-grid' : 'auth-detail-sections';
        const itemsIn = (slot: 'intro' | 'sections' | 'tail') =>
          tab.content.filter((item) => auth.renderers.slot(item.kind) === slot);
        for (const item of itemsIn('intro'))
          auth.appendContent(item, body, runtime, inputs, render, reconcile, tab);
        const sections = itemsIn('sections');
        for (const item of sections)
          auth.appendContent(item, sectionHost, runtime, inputs, render, reconcile, tab);
        if (sections.length) body.append(sectionHost);
        for (const item of itemsIn('tail'))
          auth.appendContent(item, body, runtime, inputs, render, reconcile, tab);
      },
      credentials: authCredentialReader,
      update(root, runtime) {
        auth.updateProviders(root, runtime);
        const notice = root.querySelector<HTMLElement>('[data-ejs-popup-notice]');
        if (notice) notice.textContent = runtime.level.state.notice ?? '';
      },
      refreshLanguage(root, runtime, _language, reconcile) {
        auth.refreshLanguage(root, runtime, reconcile);
      },
    })
    .register('message', {
      mount({ root, runtime }) {
        message.append(root, runtime);
      },
      update(root, runtime) {
        const article = root.querySelector<HTMLElement>('[data-ejs-message-content]');
        if (article) void message.refresh(article, runtime);
      },
      refreshLanguage(root, runtime) {
        const article = root.querySelector<HTMLElement>('[data-ejs-message-content]');
        if (article) void message.refresh(article, runtime);
      },
    })
    .register('change-report', {
      mount({ root, runtime }) {
        const report = runtime.level.data.content['report'];
        if (report && typeof report === 'object' && !Array.isArray(report))
          renderHierarchicalReport(root, report as UiChangeReport, language());
      },
      refreshLanguage(root, runtime, language) {
        const report = runtime.level.data.content['report'];
        if (!report || typeof report !== 'object' || Array.isArray(report)) return;
        const content = root.querySelector<HTMLElement>(
          `[data-popup-tab="${runtime.activeTab.id}"].ejs-semantic-popup-content`,
        );
        if (!content) return;
        const expansion = new Map<string, boolean>();
        for (const node of content.querySelectorAll<HTMLDetailsElement>(
          'details[data-change-node-path]',
        ))
          if (node.dataset['changeNodePath'])
            expansion.set(node.dataset['changeNodePath']!, node.open);
        content.querySelector('.ejs-change-report-frame')?.remove();
        renderHierarchicalReport(content, report as UiChangeReport, language, expansion);
      },
    });
}
