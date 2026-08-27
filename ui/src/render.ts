import ejs from 'ejs';
import type { Response } from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { popupContent } from './presentation/popup-content.js';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(moduleDirectory, '..');
const viewsDirectory = resolve(uiRoot, 'views');

export async function renderPage(
  res: Response,
  view: string,
  model: Record<string, unknown> = {},
) {
  const viewModel = {
    ...res.locals,
    ...model,
    popupContent,
  };

  const body = await ejs.renderFile(resolve(viewsDirectory, `${view}.ejs`), viewModel);

  // Popup copy is part of the common presentation model because shell-level auth dialogs are
  // rendered outside the page body. Supplying the same object to both rendering stages keeps
  // page popups and global popups on one semantic content source.
  res.render('layout/shell', {
    ...viewModel,
    body,
  });
}
