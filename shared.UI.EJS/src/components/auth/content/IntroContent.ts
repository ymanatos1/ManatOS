import { createNativeElement } from '../../native-template.js';
import {
  BrowserUiPageContentSource,
  multilingual,
  renderUiPage,
  type UiPageTemplateContext,
  type UiPopupIntroDefinition,
  type UiPopupRuntime,
} from '@manatos/shared-ui';

/**
 * Concrete Auth Intro owner: mounts its HTML slot and controls asynchronous,
 * translated page insertion. The revision guard is local to this child because
 * a late response must NEVER resurrect an intro from a closed/replaced tab.
 * Breakpoints: append() for composition, load() for stale-response rejection.
 */
export class IntroContent {
  private readonly source = new BrowserUiPageContentSource();
  constructor(
    private readonly language: () => 'EN' | 'EL',
    private readonly pageContext: () => UiPageTemplateContext,
  ) {}

  append(item: UiPopupIntroDefinition, parent: HTMLElement, reconcile: () => void): void {
    const intro = createNativeElement('AuthIntro', { Id: item.id });
    parent.append(intro);
    void this.load(intro, item.page, reconcile);
  }

  async load(
    element: HTMLElement,
    page: { folder: string; name: string },
    reconcile: () => void = () => {},
  ): Promise<void> {
    const revision = String(Number(element.dataset['introRevision'] ?? 0) + 1);
    element.dataset.introRevision = revision;
    element.setAttribute('aria-busy', 'true');
    try {
      const html = await renderUiPage(this.source, page, {
        ...this.pageContext(),
        $language: this.language(),
      });
      if (!element.isConnected || element.dataset['introRevision'] !== revision) return;
      element.innerHTML = html;
      element.classList.remove('auth-static-intro-error');
    } catch {
      if (!element.isConnected || element.dataset['introRevision'] !== revision) return;
      element.textContent = multilingual(this.language(), []).resolve(
        '@CM.AuthIntroductionLoadError',
      );
      element.classList.add('auth-static-intro-error');
    } finally {
      if (element.isConnected && element.dataset['introRevision'] === revision) {
        element.setAttribute('aria-busy', 'false');
        reconcile();
      }
    }
  }

  refresh(element: HTMLElement, runtime: UiPopupRuntime, reconcile: (tabId: string) => void): void {
    for (const intro of element.querySelectorAll<HTMLElement>('[data-ejs-popup-intro]')) {
      const owner = intro.closest<HTMLElement>('[data-ejs-tab-panel]');
      const tab = runtime.views.find((entry) => entry.id === owner?.dataset['ejsTabPanel']);
      const item = tab?.content.find((entry) => entry.id === intro.dataset['ejsPopupIntro']);
      if (item?.kind === 'intro' && tab) void this.load(intro, item.page, () => reconcile(tab.id));
    }
  }
}
