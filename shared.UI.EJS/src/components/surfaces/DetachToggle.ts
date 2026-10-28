import { escapeHtml } from '../../rendering/html.js';

export interface DetachToggleOptions {
  detached?: boolean;
  subject?: string;
}

export function renderDetachToggle(options: DetachToggleOptions = {}): string {
  const detached = options.detached === true;
  const subject = options.subject ?? 'surface';
  const title = `${detached ? 'Attach' : 'Detach'} ${subject}`;
  const icon = detached ? 'bi-box-arrow-in-down-left' : 'bi-box-arrow-up-right';

  return `
    <button
      type="button"
      class="detach-toggle"
      title="${escapeHtml(title)}"
      aria-label="${escapeHtml(title)}"
      aria-pressed="${detached}"
      data-detach-toggle
    >
      <i class="bi ${icon}" aria-hidden="true"></i>
    </button>
  `;
}
