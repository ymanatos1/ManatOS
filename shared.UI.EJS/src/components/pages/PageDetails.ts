import { escapeHtml } from '../../rendering/html.js';

export interface PageDetailsOptions {
  id?: string;
  eyebrow?: string;
  title?: string;
  message?: string;
  content?: string;
  hidden?: boolean;
  language?: 'EN' | 'EL';
}

export function renderPageDetails(options: PageDetailsOptions = {}): string {
  const hidden = options.hidden !== false;
  const greek = options.language === 'EL';

  return `
    <aside
      id="${escapeHtml(options.id ?? 'pageDetails')}"
      class="page-details"
      data-page-details
      aria-label="${greek ? 'Λεπτομέρειες πλαισίου' : 'Context details'}"
      aria-hidden="${hidden}"
      ${hidden ? 'hidden' : ''}
    >
      <div class="page-details-heading">
        <div>
          <span class="page-details-eyebrow">${escapeHtml(options.eyebrow ?? 'Context')}</span>
          <h2>${escapeHtml(options.title ?? 'Details')}</h2>
        </div>

        <button
          type="button"
          class="page-details-close"
          data-page-details-close
          title="${greek ? 'Κλείσιμο λεπτομερειών' : 'Close Details panel'}"
          aria-label="${greek ? 'Κλείσιμο λεπτομερειών' : 'Close Details panel'}"
        >
          <i class="bi bi-x-lg" aria-hidden="true"></i>
        </button>
      </div>

      ${
        options.message
          ? `
            <div class="page-details-card">
              <i class="bi bi-info-circle" aria-hidden="true"></i>
              ${escapeHtml(options.message)}
            </div>
          `
          : ''
      }

      ${options.content ?? ''}
    </aside>
  `;
}
