import { Component, computed } from '@angular/core';
import { ContentItemBase } from './PopupContentBase';

/**
 * Owns one reactive notice region projected from PopupContext. Never add a
 * second notice store or write popup state from this presentation child.
 * Breakpoint: notice computed projection.
 */
@Component({
  selector: 'manatos-popup-notice-content',
  standalone: true,
  host: { style: 'display: contents' },
  templateUrl: './PopupNoticeContent.html',
})
export class PopupNoticeContent extends ContentItemBase {
  // Project a transient status from PopupContext; do not introduce a separate
  // notice store in this native child or duplicate the popup's #state.
  protected readonly notice = computed(() => this.popup().notice());
}
