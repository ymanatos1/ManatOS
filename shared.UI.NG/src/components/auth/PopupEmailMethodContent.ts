import { Component, computed, ElementRef, viewChild } from '@angular/core';
import { type UiPopupEmailMethodDefinition } from '@manatos/shared-ui';
import { ContentItemBase } from './PopupContentBase';

/**
 * Owns an email-method action button and its declared actionId in the HTML.
 * The parent must not create a button or submit credentials on this child's
 * behalf. Breakpoint: HTML click binding and focusFirst() handoff.
 */
@Component({
  selector: 'manatos-popup-email-method-content',
  standalone: true,
  host: { style: 'display: contents' },
  templateUrl: './PopupEmailMethodContent.html',
})
export class PopupEmailMethodContent extends ContentItemBase {
  protected readonly item = computed(() => this.definition() as UiPopupEmailMethodDefinition);
  private readonly method = viewChild<ElementRef<HTMLButtonElement>>('method');
  focusFirst(): boolean {
    const method = this.method()?.nativeElement;
    if (!method) return false;
    method.focus();
    return true;
  }
}
