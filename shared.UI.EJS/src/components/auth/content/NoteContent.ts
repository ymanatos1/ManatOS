import { createNativeElement } from '../../native-template.js';
import { escapeHtml } from '../../../rendering/html.js';
import {
  multilingual,
  type UiPopupNoteDefinition,
  type UiPopupRuntime,
  type UiPopupText,
} from '@manatos/shared-ui';

/**
 * Informational Auth note owns the optional icon and safe text insertion.
 * The two message note IDs draw from popup #data.content; other IDs draw from
 * their declaration. Never interpolate untrusted message HTML into this slot.
 * Breakpoints: append() for source selection, refresh() for localization.
 */
export class NoteContent {
  constructor(private readonly language: () => 'EN' | 'EL') {}
  private text(value: UiPopupText): string {
    return multilingual(this.language(), []).resolve(value);
  }

  append(item: UiPopupNoteDefinition, parent: HTMLElement, popup: UiPopupRuntime): void {
    const note = createNativeElement(
      'AuthNote',
      { Id: item.id, Text: '' },
      {
        Icon:
          item.illustration &&
          /^\/_manatos\/pages\/messages\/assets\/[a-z0-9-]+\.svg$/.test(item.illustration)
            ? `<img class="manatos-unsaved-illustration" src="${escapeHtml(item.illustration)}" alt="" aria-hidden="true">`
            : item.icon
              ? `<i class="bi ${escapeHtml(item.icon)}" aria-hidden="true"></i>`
              : '',
      },
    );
    if (item.id !== 'message-body' && item.id !== 'message-details')
      note.dataset.ejsStaticNote = item.id;
    else note.dataset.ejsMessageNote = item.id;
    const source =
      item.id === 'message-body'
        ? (popup.level.data.content['text'] ?? popup.level.data.content['message'])
        : item.id === 'message-details'
          ? popup.level.data.content['details']
          : undefined;
    const copy = note.querySelector<HTMLElement>('[data-ejs-static-note-text]');
    if (!copy) throw new Error('AuthNote template is missing its text slot.');
    copy.textContent =
      source && (typeof source === 'string' || (typeof source === 'object' && 'EN' in source))
        ? this.text(source as UiPopupText)
        : this.text(item.text);
    parent.append(note);
  }

  refresh(element: HTMLElement, runtime: UiPopupRuntime): void {
    for (const node of element.querySelectorAll<HTMLElement>('[data-ejs-static-note]')) {
      const owner = node.closest<HTMLElement>('[data-ejs-tab-panel]');
      const tab = runtime.views.find((entry) => entry.id === owner?.dataset['ejsTabPanel']);
      const item = tab?.content
        .flatMap((content) => (content.kind === 'section' ? content.children : [content]))
        .find((entry) => entry.id === node.dataset['ejsStaticNote']);
      if (item?.kind !== 'note') continue;
      const copy = node.querySelector<HTMLElement>('[data-ejs-static-note-text]');
      if (copy) copy.textContent = this.text(item.text);
    }
  }
}
