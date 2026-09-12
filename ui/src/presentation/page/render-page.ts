import ejs from 'ejs';
import type { Response } from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { hasUIEntityPermission } from '../../sysbo/permissions.js';
import { popupContent } from '../popup/popup-content.js';
import {
  buildCalculatedContextDebuggingRows,
  buildMetadataDebuggingModel,
} from '../metadata/debugging-model.js';
import {
  formatMetadataValue,
  metadataOptionItemForField,
  metadataOptionToneClass,
} from '../metadata/value-presentation.js';
import {
  allManatOSObjectMetadata,
  allSysBOUIMetadata,
  resolveEntryRepresentation,
  type ExpressionDiagnostic,
  type ManatOSContext,
  type ManatOSObjectMetadata,
} from '@manatos/shared';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(moduleDirectory, '../../..');
const viewsDirectory = resolve(uiRoot, 'views');

// Changes on every UI-server process start. Browser debugger state is keyed by
// this value so normal page reloads preserve state, while a ManatOS restart
// deliberately starts a fresh debugging session.
const uiBootId = randomUUID();

export async function renderPage(res: Response, view: string, model: Record<string, unknown> = {}) {
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

  const ctx = viewModel.ctx as ManatOSContext | undefined;

  // Calculated ctx.user fields are materialized by page-context before this
  // rendering boundary. Views consume that canonical published value only; the
  // renderer must never become a second expression-evaluation owner.
  const ctxDiagnostics: ExpressionDiagnostic[] = [];
  const ctxUserFieldValue = (key: string): unknown => ctx?.user?.fields?.[key]?.value;

  /**
   * Resolve one record's canonical entry presentation at the rendering boundary.
   * Routes supply domain rows only; views combine those rows with already-loaded
   * canonical/UI metadata instead of receiving synthetic __entry* properties.
   */
  const entryRepresentationFor = (
    entityKey: string,
    entry: unknown,
    entityIcon: string | null = null,
  ) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const metadata = allManatOSObjectMetadata[
      entityKey as keyof typeof allManatOSObjectMetadata
    ] as ManatOSObjectMetadata<Record<string, unknown>> | undefined;
    if (!metadata) return null;
    return resolveEntryRepresentation(
      metadata,
      allSysBOUIMetadata[entityKey as keyof typeof allSysBOUIMetadata],
      entry as Readonly<Record<string, unknown>>,
      { ...(entityIcon ? { entityIcon } : {}) },
    );
  };

  /** Return one current UI-metadata related-collection declaration, when any. */
  const relatedCollectionMetadataFor = (ownerEntityKey: string, collectionKey: string) =>
    allSysBOUIMetadata[ownerEntityKey as keyof typeof allSysBOUIMetadata]?.record
      .relatedCollections?.[collectionKey] ?? null;

  // Authored expression source is the durable presentation/debugging contract. Browser
  // execution resolves that source through the UI process's canonical compile/cache boundary;
  // rendered page models never carry executable AST objects.

  /*
   * Host boundary: EJS may use the server's render-time UI projection to compose
   * markup, but the browser never receives that tree as authoritative CTX.
   *
   * `browserCtx` therefore contains only non-UI root facts. The browser host
   * constructs ctx.ui from the route invocation/bootstrap contract before the
   * generic CTX runtime starts, preserving one browser-owned surface topology.
   */
  const browserCtx = ctx
    ? (() => {
        const { ui: _serverRenderUi, ...projection } = ctx as ManatOSContext & { ui?: unknown };
        void _serverRenderUi;
        return projection;
      })()
    : null;

  const renderedModel: Record<string, unknown> = {
    ...viewModel,
    ...(ctx ? { ctx } : {}),
    browserCtx,
    ctxUserFieldValue,
    buildMetadataDebuggingModel,
    buildCalculatedContextDebuggingRows,
    formatMetadataValue,
    metadataOptionItemForField,
    metadataOptionToneClass,
    entryRepresentationFor,
    relatedCollectionMetadataFor,
    hasUIEntityPermission,
    breadcrumbItems: Array.isArray(viewModel.breadcrumbItems) ? viewModel.breadcrumbItems : [],
    relatedEntityMetadata: allManatOSObjectMetadata,
    relatedEntityUIMetadata: allSysBOUIMetadata,
    ctxDiagnostics,
    uiBootId,
  };

  const body = await ejs.renderFile(resolve(viewsDirectory, `${view}.ejs`), renderedModel);

  res.render('layout/shell', {
    ...renderedModel,
    body,
  });
}
