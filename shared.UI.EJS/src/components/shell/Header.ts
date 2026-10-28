import { MANATOS_UI_BRANDING } from '@manatos/shared-ui';

export interface HeaderOptions {
  versionLabel: string;
  actions?: string;
  status?: string;
}

export function renderHeader(options: HeaderOptions): string {
  return `
    <header class="header">
      <div class="brand-area">
        <a class="brand" href="/" aria-label="ManatOS home">
          <img
            class="brand-logo brand-logo-darker"
            src="${MANATOS_UI_BRANDING.headerLogo.darker.src}"
            alt="${MANATOS_UI_BRANDING.headerLogo.darker.alt}"
          >
          <img
            class="brand-logo brand-logo-lighter"
            src="${MANATOS_UI_BRANDING.headerLogo.lighter.src}"
            alt="${MANATOS_UI_BRANDING.headerLogo.lighter.alt}"
          >
        </a>

        ${options.status ?? `<span class="version-badge" title="ManatOS version">${options.versionLabel}</span>`}
      </div>

      <div class="actions">${options.actions ?? ''}</div>
    </header>
  `;
}
