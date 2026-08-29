import ejs from 'ejs';
import type { Response } from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { popupContent } from './presentation/popup-content.js';
import {
  contextFields,
  currentPageContext,
  pageContextNode,
  setPageContext,
} from './context/manatos-context.js';
import type { ManatOSContext } from '@manatos/shared';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(moduleDirectory, '..');
const viewsDirectory = resolve(uiRoot, 'views');

export async function renderPage(
  res: Response,
  view: string,
  model: Record<string, unknown> = {},
) {
  /*
   * Give the merged model an explicit open shape. Express locals are broadly
   * typed and popupContent is intentionally narrow; without this annotation
   * TypeScript can infer only popupContent's concrete structure here.
   */
  const viewModel: Record<string, unknown> = {
    ...res.locals,
    ...model,
    popupContent,
  };

  // Every rendered page receives a page scope. Routes with richer semantics
  // attach their own branch first; ordinary pages receive a neutral page scope.
  const baseCtx = viewModel.ctx as ManatOSContext | undefined;
  const ctx = baseCtx && !baseCtx.page
    ? setPageContext(
        baseCtx,
        pageContextNode(
          'page',
          'page',
          'none',
          contextFields({
            view,
            title: typeof viewModel.title === 'string' ? viewModel.title : null,
          }),
        ),
      )
    : baseCtx;

  // EJS convenience cursor only. The canonical structure remains ctx.page.page...
  const renderedModel: Record<string, unknown> = {
    ...viewModel,
    ...(ctx ? { ctx } : {}),
    ctxPage: ctx ? currentPageContext(ctx) : null,
  };

  const body = await ejs.renderFile(resolve(viewsDirectory, `${view}.ejs`), renderedModel);

  res.render('layout/shell', {
    ...renderedModel,
    body,
  });
}
