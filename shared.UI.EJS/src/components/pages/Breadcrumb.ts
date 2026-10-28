import { multilingual, type UiBreadcrumbItem } from '@manatos/shared-ui';

import { escapeHtml } from '../../rendering/html.js';

export interface BreadcrumbOptions {
  items: readonly UiBreadcrumbItem[];
  actions?: string;
  language?: 'EN' | 'EL';
}

export function renderBreadcrumb(options: BreadcrumbOptions): string {
  const breadcrumbLabel = multilingual(options.language ?? 'EN', ['Breadcrumb']).Breadcrumb;
  const items = options.items
    .map((item, index) => {
      const separator = index > 0 ? '<i class="bi bi-chevron-right" aria-hidden="true"></i>' : '';

      const current = index === options.items.length - 1;

      const value =
        item.href && !current
          ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`
          : `<span${current ? ' aria-current="page"' : ''}>${escapeHtml(item.label)}</span>`;

      return `${separator}${value}`;
    })
    .join('');

  return `
    <div class="breadcrumb-row">
      <nav class="page-breadcrumb" aria-label="${escapeHtml(breadcrumbLabel)}">
        ${items}
      </nav>

      <div class="breadcrumb-actions">${options.actions ?? ''}</div>
    </div>
  `;
}
