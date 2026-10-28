import { createNativeElement } from '../../native-template.js';
import {
  multilingual,
  type UiPopupEmailMethodDefinition,
  type UiPopupRuntime,
  type UiPopupText,
} from '@manatos/shared-ui';

/**
 * The email Auth method owns its actual button and click-to-action boundary.
 * Do not move the click listener into the generic popup host or store credentials
 * here; the canonical PopupRuntime validates and executes the declared action.
 * Breakpoints: append() for click dispatch; refresh() for translated copy.
 */
export class EmailMethodContent {
  constructor(private readonly language: () => 'EN' | 'EL') {}
  private text(value: UiPopupText): string {
    return multilingual(this.language(), []).resolve(value);
  }

  append(item: UiPopupEmailMethodDefinition, parent: HTMLElement, popup: UiPopupRuntime): void {
    const button = createNativeElement('AuthEmailMethod', {
      Id: item.id,
      Label: this.text(item.label),
      Description: this.text(item.description),
    }) as HTMLButtonElement;
    button.addEventListener('click', () => {
      if (!popup.level.state.busy) popup.requestAction(item.actionId);
    });
    parent.append(button);
  }

  refresh(element: HTMLElement, runtime: UiPopupRuntime): void {
    for (const method of element.querySelectorAll<HTMLButtonElement>('[data-ejs-method]')) {
      const owner = method.closest<HTMLElement>('[data-ejs-tab-panel]');
      const tab = runtime.views.find((entry) => entry.id === owner?.dataset['ejsTabPanel']);
      const item = tab?.content
        .flatMap((content) => (content.kind === 'section' ? content.children : [content]))
        .find((entry) => entry.id === method.dataset['ejsMethod']);
      if (item?.kind !== 'email-method') continue;
      const label = method.querySelector<HTMLElement>('[data-ejs-method-label]');
      if (label) label.textContent = this.text(item.label);
    }
    for (const description of element.querySelectorAll<HTMLElement>(
      '[data-ejs-method-description]',
    )) {
      const owner = description.closest<HTMLElement>('[data-ejs-tab-panel]');
      const tab = runtime.views.find((entry) => entry.id === owner?.dataset['ejsTabPanel']);
      const item = tab?.content
        .flatMap((content) => (content.kind === 'section' ? content.children : [content]))
        .find((entry) => entry.id === description.dataset['ejsMethodDescription']);
      if (item?.kind === 'email-method') description.textContent = this.text(item.description);
    }
  }
}
