import type { UiPageIdentity } from '@manatos/shared';

export interface UiPageContentSource {
  readPage(page: UiPageIdentity, language?: string): Promise<string>;
}

function encodePath(value: string): string {
  return value.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

export function uiPageFolderUrl(page: UiPageIdentity): string {
  return `/_manatos/pages/${encodePath(page.folder)}`;
}

export function uiPageTemplateUrl(page: UiPageIdentity, language = 'en'): string {
  const suffix = language.toLowerCase() === 'el' ? '-EL' : '';
  return `${uiPageFolderUrl(page)}/${encodeURIComponent(page.name + suffix)}.html`;
}

export function uiPageStylesheetUrl(page: UiPageIdentity): string {
  return `${uiPageFolderUrl(page)}/Styles.css`;
}

export class BrowserUiPageContentSource implements UiPageContentSource {
  async readPage(page: UiPageIdentity, language = 'en'): Promise<string> {
    let response = await fetch(uiPageTemplateUrl(page, language), {
      headers: {
        accept: 'text/html',
      },
    });

    if (response.status === 404 && language.toLowerCase() === 'el') {
      response = await fetch(uiPageTemplateUrl(page), { headers: { accept: 'text/html' } });
    }

    if (!response.ok) {
      throw new Error(
        `UI page resource '${page.folder}/${page.name}' returned ${response.status}.`,
      );
    }

    return response.text();
  }
}

export function ensureUiPageStylesheet(
  page: UiPageIdentity,
  documentRoot: Document = document,
): void {
  const href = uiPageStylesheetUrl(page);

  const existing = documentRoot.head.querySelector<HTMLLinkElement>(
    'link[data-manatos-page-style]',
  );

  if (existing) {
    if (existing.getAttribute('href') !== href) {
      existing.href = href;
    }

    existing.dataset.manatosPageStyle = page.folder;
    return;
  }

  const link = documentRoot.createElement('link');

  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.manatosPageStyle = page.folder;

  documentRoot.head.append(link);
}
