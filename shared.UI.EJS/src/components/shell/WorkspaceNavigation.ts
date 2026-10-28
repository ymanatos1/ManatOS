import {
  activeWorkspaceNavigationItemId,
  workspaceNavigationHref,
  multilingual,
  type UiNavigationItem,
} from '@manatos/shared-ui';
import type { MetadataLanguage } from '@manatos/shared';
import { escapeHtml, safeIconClass } from '../../rendering/html.js';

export interface WorkspaceNavigationOptions {
  items: readonly UiNavigationItem[];
  pathname?: string;
  language?: MetadataLanguage;
}

function renderWorkspaceItem(item: UiNavigationItem, activeId: string | null, depth = 0): string {
  const children = item.children
    .map((child) => renderWorkspaceItem(child, activeId, depth + 1))
    .join('');

  if (item.children.length > 0) {
    return `
      <div class="workspace-navigation-entry${item.separatorBefore ? ' separator-before' : ''}">
        <details class="workspace-navigation-group"${depth === 0 ? ' open' : ''}>
          <summary title="${escapeHtml(item.tooltip ?? item.label)}">
            <span class="workspace-navigation-caption">
              ${item.icon ? `<i class="bi ${safeIconClass(item.icon)}" aria-hidden="true"></i>` : ''}
              <span>${escapeHtml(item.label)}</span>
            </span>

            <i class="bi bi-chevron-down workspace-navigation-chevron" aria-hidden="true"></i>
          </summary>

          <div class="workspace-navigation-children">
            ${children}
          </div>
        </details>
      </div>
    `;
  }

  const href = workspaceNavigationHref(item);
  const active = activeId === item.id && href !== null;
  return `
    <div class="workspace-navigation-entry${item.separatorBefore ? ' separator-before' : ''}">
      ${
        href === null
          ? `<button type="button" class="workspace-navigation-item" data-navigation-id="${escapeHtml(item.id)}" title="${escapeHtml(item.tooltip ?? item.label)}">`
          : `<a href="${escapeHtml(href)}" class="workspace-navigation-item${active ? ' is-active' : ''}"${active ? ' aria-current="page"' : ''} data-navigation-id="${escapeHtml(item.id)}" title="${escapeHtml(item.tooltip ?? item.label)}">`
      }
        ${item.icon ? `<i class="bi ${safeIconClass(item.icon)}" aria-hidden="true"></i>` : ''}
        <span>${escapeHtml(item.label)}</span>
      ${href === null ? '</button>' : '</a>'}
    </div>
  `;
}

export function renderWorkspaceNavigation(options: WorkspaceNavigationOptions): string {
  const activeId = activeWorkspaceNavigationItemId(options.items, options.pathname ?? '/');
  const text = multilingual(options.language ?? 'EN', [
    'Workspace',
    'WorkspaceNavigation',
    'PersonalActions',
  ] as const);
  return `
    <aside class="workspace-navigation">
      <div class="heading">${escapeHtml(text.Workspace)}</div>

      <nav aria-label="${escapeHtml(text.WorkspaceNavigation)}">
        ${options.items
          .filter((item) => !item.dockBottom)
          .map((item) => renderWorkspaceItem(item, activeId))
          .join('')}
      </nav>

      <nav class="workspace-navigation-bottom" aria-label="${escapeHtml(text.PersonalActions)}">
        ${options.items
          .filter((item) => item.dockBottom)
          .map((item) => renderWorkspaceItem(item, activeId))
          .join('')}
      </nav>
    </aside>
  `;
}
