import type { UiPageIdentity } from '@manatos/shared';

import { uiPageFolderUrl, type UiPageContentSource } from './source.js';

import { renderUiContent } from '../runtime/content/runtime.js';
import type { UiPageTemplateContext } from '../runtime/content/template.js';

export async function renderUiPage(
  source: UiPageContentSource,
  page: UiPageIdentity,
  context: UiPageTemplateContext,
): Promise<string> {
  const templateContext = Object.freeze({
    ...context,

    $page: Object.freeze({
      folder: page.folder,
      name: page.name,
      resourceBaseUrl: uiPageFolderUrl(page),
    }),
  });

  const language = String(context['$language'] ?? 'en');
  return renderUiContent(await source.readPage(page, language), templateContext);
}
