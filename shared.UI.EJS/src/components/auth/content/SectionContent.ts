import { createNativeElement } from '../../native-template.js';
import { escapeHtml } from '../../../rendering/html.js';
import {
  multilingual,
  type UiPopupContentDefinition,
  type UiPopupRuntime,
  type UiPopupSectionDefinition,
  type UiPopupTabDefinition,
  type UiPopupText,
} from '@manatos/shared-ui';

/**
 * One Auth section owns its card, heading, description and nested content slots.
 * Its children are composed by the registered dispatcher; do NOT flatten their
 * actions/credentials into this parent or invent a second popup #level.
 * Breakpoints: append() for recursive placement; refresh() for localization.
 */
export class SectionContent {
  constructor(
    private readonly language: () => 'EN' | 'EL',
    private readonly appendChild: (
      child: UiPopupContentDefinition,
      parent: HTMLElement,
      popup: UiPopupRuntime,
      inputs: Map<string, HTMLInputElement>,
      render: () => void,
      reconcile: () => void,
      tab: UiPopupTabDefinition,
    ) => void,
  ) {}

  private text(value: UiPopupText | undefined): string {
    return value === undefined ? '' : multilingual(this.language(), []).resolve(value);
  }

  append(
    item: UiPopupSectionDefinition,
    parent: HTMLElement,
    popup: UiPopupRuntime,
    inputs: Map<string, HTMLInputElement>,
    render: () => void,
    reconcile: () => void,
    tab: UiPopupTabDefinition,
  ): void {
    const index = tab.content
      .filter((entry) => entry.kind === 'section')
      .findIndex((entry) => entry.id === item.id);
    const methods = tab.id === 'signin' || tab.id === 'methods';
    const sectionClass = methods
      ? 'auth-method-card ejs-semantic-popup-section'
      : tab.id === 'reset'
        ? 'reset-form-card ejs-semantic-popup-section'
        : 'auth-registration-form-card ejs-semantic-popup-section';
    const section = createNativeElement(
      'AuthSection',
      {
        Id: item.id,
        Column: `${tab.id}-column${index}`,
        Class: tab.id === 'change' ? `${sectionClass} change-password-form-card` : sectionClass,
        Heading: this.text(item.heading),
      },
      {
        Icon: item.icon ? `<i class="bi ${escapeHtml(item.icon)}" aria-hidden="true"></i>` : '',
        Description: item.description
          ? `<p class="auth-method-description" data-ejs-section-description="${escapeHtml(item.id)}">${escapeHtml(this.text(item.description))}</p>`
          : '',
        Children: '',
      },
    );
    for (const child of item.children)
      this.appendChild(child, section, popup, inputs, render, reconcile, tab);
    parent.append(section);
  }

  refresh(element: HTMLElement, runtime: UiPopupRuntime): void {
    for (const node of element.querySelectorAll<HTMLElement>(
      '[data-ejs-section-heading], [data-ejs-section-description]',
    )) {
      const id = node.dataset['ejsSectionHeading'] ?? node.dataset['ejsSectionDescription'];
      const owner = node.closest<HTMLElement>('[data-ejs-tab-panel]');
      const tab = runtime.views.find((entry) => entry.id === owner?.dataset['ejsTabPanel']);
      const item = tab?.content.find((entry) => entry.id === id);
      if (item?.kind !== 'section') continue;
      const target = node.dataset['ejsSectionHeading']
        ? node.querySelector<HTMLElement>('[data-ejs-section-heading-text]')
        : node;
      if (target)
        target.textContent = this.text(
          node.dataset['ejsSectionHeading'] ? item.heading : item.description,
        );
    }
  }
}
