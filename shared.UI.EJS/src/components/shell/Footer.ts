import { escapeHtml } from '../../rendering/html.js';

export interface FooterOptions {
  companyShortName: string;
  companyName: string;
  versionLabel: string;
  interactive?: boolean;
  language?: 'EN' | 'EL';
}

export function renderFooter(options: FooterOptions): string {
  return `
    <footer class="corporate-footer">
      <div class="footer-brand">
        <strong>${escapeHtml(options.companyShortName)}</strong>
        <span>© ${new Date().getFullYear()} ${escapeHtml(options.companyName)}</span>
      </div>

      <div class="footer-links">
        ${
          options.interactive === false
            ? ''
            : `<a href="/company">${options.language === 'EL' ? 'Εταιρεία' : 'Company'}</a><a href="/privacy">${options.language === 'EL' ? 'Απόρρητο' : 'Privacy'}</a><a href="/terms">${options.language === 'EL' ? 'Όροι χρήσης' : 'Terms'}</a><a href="#">${options.language === 'EL' ? 'Επικοινωνία' : 'Contact'}</a>`
        }
        <span class="footer-version">${escapeHtml(options.versionLabel)}</span>
      </div>
    </footer>
  `;
}
