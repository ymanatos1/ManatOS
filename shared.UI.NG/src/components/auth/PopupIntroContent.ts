import { Component, computed, effect, signal } from '@angular/core';
import {
  BrowserUiPageContentSource,
  renderUiPage,
  type UiPopupIntroDefinition,
} from '@manatos/shared-ui';
import { ContentItemBase } from './PopupContentBase';

/**
 * Owns the static introductory HTML slot and async language-sensitive render.
 * Cancellation prevents stale async content from repainting a switched tab;
 * a popup Host must never fetch or mount this child for it.
 * Breakpoint: constructor effect, then renderUiPage completion/cancellation.
 */
@Component({
  selector: 'manatos-popup-intro-content',
  standalone: true,
  host: { style: 'display: contents' },
  templateUrl: './PopupIntroContent.html',
})
export class PopupIntroContent extends ContentItemBase {
  protected readonly item = computed(() => this.definition() as UiPopupIntroDefinition);
  protected readonly html = signal<string | null>(null);
  protected readonly loadError = signal(false);
  private readonly source = new BrowserUiPageContentSource();
  constructor() {
    super();
    effect((onCleanup) => {
      const view = this.item();
      const context = this.contentContext();
      this.html.set(null);
      this.loadError.set(false);
      let active = true;
      void renderUiPage(this.source, view.page, context).then(
        (markup) => {
          if (active) this.html.set(markup);
        },
        () => {
          if (active) this.loadError.set(true);
        },
      );
      onCleanup(() => {
        active = false;
      });
    });
  }
}
