import { createNativeElement } from '../../native-template.js';
import { type UiPopupContentDefinition } from '@manatos/shared-ui';

/**
 * One visible notice region is an explicit registered child. Only the popup
 * runtime owns message status; this child must not invent a parallel store.
 * Breakpoint: append() when the host composes the semantic notice slot.
 */
export class NoticeContent {
  append(item: Extract<UiPopupContentDefinition, { kind: 'notice' }>, parent: HTMLElement): void {
    parent.append(createNativeElement('AuthNotice', { Id: item.id }));
  }
}
