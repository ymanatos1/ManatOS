import type { UiTitleModel } from '@manatos/shared-ui';

import { escapeHtml, safeIconClass } from '../../rendering/html.js';

export interface TitleOptions {
  model: UiTitleModel;
  actions?: string;
}

export class Title {
  constructor(protected readonly options: TitleOptions) {}

  protected classes(): string {
    return 'surface-title';
  }

  render(): string {
    const { model } = this.options;
    const icon = safeIconClass(model.icon);

    return `
      <header class="${this.classes()}">
        <div class="surface-title-copy">
          <h1>
            ${icon ? `<i class="bi ${icon} surface-title-icon" aria-hidden="true"></i>` : ''}
            ${escapeHtml(model.title)}
          </h1>

          ${
            model.subtitle
              ? `<p class="surface-title-subtitle">${escapeHtml(model.subtitle)}</p>`
              : ''
          }
        </div>

        <div class="surface-title-actions">${this.options.actions ?? ''}</div>
      </header>
    `;
  }
}

export function renderTitle(options: TitleOptions): string {
  return new Title(options).render();
}
