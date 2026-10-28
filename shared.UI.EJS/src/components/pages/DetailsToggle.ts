import { escapeHtml } from '../../rendering/html.js';

export interface DetailsToggleOptions {
  expanded?: boolean;
  controlsId?: string;
  label?: string;
}

export function renderDetailsToggle(options: DetailsToggleOptions = {}): string {
  const expanded = options.expanded === true;
  const controlsId = options.controlsId ?? 'pageDetails';

  return `
    <button
      type="button"
      class="details-toggle${expanded ? ' active' : ''}"
      data-page-details-toggle
      aria-controls="${escapeHtml(controlsId)}"
      aria-expanded="${expanded}"
    >
      <i class="bi bi-layout-sidebar-reverse" aria-hidden="true"></i>
      <span>${escapeHtml(options.label ?? 'Details')}</span>
    </button>
  `;
}
