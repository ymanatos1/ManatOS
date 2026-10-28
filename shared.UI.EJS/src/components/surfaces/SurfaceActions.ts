import { uiSurfaceActions } from '@manatos/shared-ui';
import type { MetadataLanguage } from '@manatos/shared';
import { escapeHtml } from '../../rendering/html.js';

/** Shared action descriptors and Auth footer styling; only the Host dispatches effects. */
export function renderSurfaceActions(
  kind: 'list' | 'entry',
  host: 'page' | 'popup',
  entityKey: string,
  language: MetadataLanguage,
): string {
  const actions = uiSurfaceActions(kind, host);
  if (!actions.length) return '';
  const buttons = actions
    .map((action) => {
      const text = `${escapeHtml(action.label[language] ?? action.label.EN)}`;
      const inner = `<i class="bi ${escapeHtml(action.icon)}" aria-hidden="true"></i> <span data-surface-action-label>${text}</span>`;
      return action.id === 'close' && host === 'page'
        ? `<a class="manatos-surface-action" data-surface-action="close" href="/bo/${encodeURIComponent(entityKey)}">${inner}</a>`
        : `<button type="button" class="manatos-surface-action${action.primary ? ' is-primary' : ''}" data-surface-action="${action.id}"${action.implemented && action.id !== 'save' ? '' : ' disabled'}>${inner}</button>`;
    })
    .join('');
  return `<footer class="ejs-semantic-popup-footer manatos-surface-actions" data-${kind}-layout="Actions">${buttons}</footer>`;
}
