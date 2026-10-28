import type { UiNavigationItem } from '@manatos/shared-ui';
import { escapeHtml, safeIconClass } from '../../rendering/html.js';

/** Recursive semantic nav-item renderer; hosts manage selection and expansion. */
function renderItemContent(item: UiNavigationItem): string {
  return `${item.icon ? `<i class="bi ${safeIconClass(item.icon)}" aria-hidden="true"></i>` : ''}<span>${escapeHtml(item.label)}</span>`;
}

export function renderPrimaryNavigationItem(item: UiNavigationItem, depth: number): string {
  const content = renderItemContent(item);

  if (item.children.length > 0) {
    const topLevel = depth === 0;

    return `
      <div class="primary-navigation-dropdown ${topLevel ? 'primary-navigation-top-level' : 'primary-navigation-nested'}"${topLevel ? ` data-primary-navigation-dropdown data-primary-navigation-id="${escapeHtml(item.id)}"` : ''}>
        <button
          type="button"
          class="primary-navigation-item"
          title="${escapeHtml(item.tooltip ?? item.label)}"
          ${topLevel ? 'aria-expanded="false" data-primary-navigation-toggle' : 'data-navigation-parent'}
        >
          ${content}
          <i class="bi ${topLevel ? 'bi-caret-down-fill navigation-caret' : 'bi-chevron-right submenu-caret'}" aria-hidden="true"></i>
        </button>

        <div class="${topLevel ? 'primary-navigation-menu' : 'primary-navigation-submenu-menu'}"${topLevel ? ' hidden data-primary-navigation-menu' : ''}>
          ${item.children.map((child) => renderPrimaryNavigationItem(child, depth + 1)).join('')}
        </div>
      </div>
    `;
  }

  return `
    <button
      type="button"
      class="primary-navigation-item"
      title="${escapeHtml(item.tooltip ?? item.label)}"
      data-navigation-id="${escapeHtml(item.id)}"
    >
      ${content}
    </button>
  `;
}
