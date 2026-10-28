import { escapeHtml, safeIconClass } from '../../rendering/html.js';

export interface SurfaceActionOptions {
  label: string;
  icon: string;
  action: string;
  disabled?: boolean;
}

export function renderSurfaceAction(options: SurfaceActionOptions): string {
  const icon = safeIconClass(options.icon);
  return `
    <button
      type="button"
      class="surface-action"
      title="${escapeHtml(options.label)}"
      aria-label="${escapeHtml(options.label)}"
      data-surface-action="${escapeHtml(options.action)}"
      ${options.disabled ? 'disabled' : ''}
    >
      ${icon ? `<i class="bi ${icon}" aria-hidden="true"></i>` : ''}
    </button>
  `;
}
