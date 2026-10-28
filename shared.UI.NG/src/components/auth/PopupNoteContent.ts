import { Component, computed } from '@angular/core';
import { type UiPopupNoteDefinition } from '@manatos/shared-ui';
import { ContentItemBase } from './PopupContentBase';

/**
 * Owns the translated informational text/icon slot; its HTML is distinct
 * from action and credential components to avoid accidental input side effects.
 */
@Component({
  selector: 'manatos-popup-note-content',
  standalone: true,
  host: { style: 'display: contents' },
  templateUrl: './PopupNoteContent.html',
})
export class PopupNoteContent extends ContentItemBase {
  protected readonly item = computed(() => this.definition() as UiPopupNoteDefinition);
}
