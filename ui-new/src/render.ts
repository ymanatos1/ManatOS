import ejs from 'ejs';
import type { Response } from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(moduleDirectory, '..');
const viewsDirectory = resolve(uiRoot, 'views');

export async function renderPage(
  res: Response,
  view: string,
  model: Record<string, unknown> = {},
) {
  const body = await ejs.renderFile(resolve(viewsDirectory, `${view}.ejs`), {
    ...res.locals,
    ...model,
  });

  res.render('layout/shell', {
    ...model,
    body,
  });
}
