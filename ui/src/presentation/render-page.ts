import ejs from 'ejs';
import type { Response } from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { popupContent } from './popup-content.js';
import {
  buildCalculatedContextDebuggingRows,
  buildMetadataDebuggingModel,
} from './metadata-debugging-model.js';
import {
  formatMetadataValue,
  metadataOptionItemForField,
  metadataOptionToneClass,
} from './metadata-value-presentation.js';
import {
  contextFields,
  currentPageContext,
  pageContextNode,
  pageBreadcrumbItems,
  setPageContext,
} from '../context/manatos-context.js';
import {
  allManatOSObjectMetadata,
  allSysBOUIMetadata,
  resolveEntryRepresentation,
  contextPathOf,
  evaluateCompiledExpression,
  expressionCapabilities,
  evaluateExpression,
  compileExpression,
  type ExpressionDiagnostic,
  type ExpressionEvaluationCaller,
  type ManatOSCalculatedContextField,
  type ManatOSContext,
  type ManatOSObjectMetadata,
} from '@manatos/shared';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(moduleDirectory, '../..');
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

  // Every rendered page receives a page scope. Routes with richer semantics
  // attach their own branch first; ordinary pages receive a neutral page scope.
  const baseCtx = viewModel.ctx as ManatOSContext | undefined;
  const ctx =
    baseCtx && !baseCtx.page
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
  const ctxPage = ctx ? currentPageContext(ctx) : null;

  const appRuntime = viewModel.app as
    | {
        scopes?: { request?: { requestId?: unknown } };
      }
    | undefined;
  const requestId =
    typeof appRuntime?.scopes?.request?.requestId === 'string'
      ? appRuntime.scopes.request.requestId
      : undefined;
  const evaluationCaller = (caller: ExpressionEvaluationCaller): ExpressionEvaluationCaller =>
    requestId ? { ...caller, requestId } : caller;

  // Render-time CTX/evaluator diagnostics are both logged server-side and
  // carried once into the rendered page. The browser Debug menu may surface
  // them as developer notifications without coupling the evaluator to UI code.
  const ctxDiagnostics: ExpressionDiagnostic[] = [];
  const recordDiagnostic = (diagnostic: ExpressionDiagnostic) => {
    ctxDiagnostics.push(diagnostic);
    console.error('[ManatOS expression evaluation]', diagnostic);
  };

  /*
   * Generic lazy CTX field accessor for server-rendered views. Stored fields
   * return immediately; calculated fields evaluate their already-parsed AST
   * only when a renderer actually asks for the value. The current scope is the
   * page's keyed fields collection so expressions such as `firstName + ' ' +
   * lastName` resolve field names naturally without knowing anything about
   * SysBOUsers or any other concrete page/entity.
   */
  const ctxFieldValue = (key: string): unknown => {
    const field = ctxPage?.fields?.[key];
    if (!field) return undefined;

    if ('expression' in field && 'ast' in field && ctx) {
      const calculated = field as ManatOSCalculatedContextField;
      try {
        const fieldsPath = contextPathOf(ctx, ctxPage.fields) ?? 'ctx.page.fields';
        if (expressionCapabilities(calculated.ast).includes('entityResolver'))
          return calculated.value;
        return evaluateCompiledExpression(
          {
            source: calculated.expression,
            ast: calculated.ast,
            requiredCapabilities: expressionCapabilities(calculated.ast),
          },
          ctx,
          ctxPage.fields,
          evaluationCaller({
            source: 'renderer',
            sourcePath: fieldsPath,
            targetPath: `${fieldsPath}.${key}`,
            purpose: 'render calculated page field value',
          }),
          {
            diagnosticSink: recordDiagnostic,
          },
        );
      } catch {
        // Diagnostics above preserve the bug signal; rendering stays resilient.
        return undefined;
      }
    }

    return field.value;
  };

  const ctxUserFieldValue = (key: string): unknown => {
    const field = ctx?.user?.fields?.[key];
    if (!field) return undefined;
    if ('expression' in field && 'ast' in field && ctx) {
      const calculated = field as ManatOSCalculatedContextField;
      try {
        const fieldsPath = contextPathOf(ctx, ctx.user?.fields ?? null) ?? 'ctx.user.fields';
        if (expressionCapabilities(calculated.ast).includes('entityResolver'))
          return calculated.value;
        return evaluateCompiledExpression(
          {
            source: calculated.expression,
            ast: calculated.ast,
            requiredCapabilities: expressionCapabilities(calculated.ast),
          },
          ctx,
          ctx.user?.fields ?? null,
          evaluationCaller({
            source: 'renderer',
            sourcePath: fieldsPath,
            targetPath: `${fieldsPath}.${key}`,
            purpose: 'render calculated authenticated-user field value',
          }),
          { diagnosticSink: recordDiagnostic },
        );
      } catch {
        return undefined;
      }
    }
    return field.value;
  };

  /**
   * Generic expression accessor for presentation metadata whose current scope
   * is not a page field collection (for example a related-record row). The
   * evaluator remains context-agnostic; callers supply only the expression and
   * the current CTX node/scope.
   */
  const ctxExpressionValue = (
    expression: string,
    currentCtxNode: unknown,
    caller: ExpressionEvaluationCaller = {
      source: 'ui-metadata',
      purpose: 'evaluate dynamic UI metadata value',
    },
  ): unknown => {
    if (!ctx) return undefined;
    try {
      return evaluateExpression(expression, ctx, currentCtxNode, evaluationCaller(caller), {
        diagnosticSink: recordDiagnostic,
      });
    } catch {
      return undefined;
    }
  };

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

  // Compile reusable UI expressions at the rendering boundary. Browser components
  // receive canonical ASTs and never reparse expression source strings.
  const compileUIExpression = (expression: string) => compileExpression(expression);

  const renderedModel: Record<string, unknown> = {
    ...viewModel,
    ...(ctx ? { ctx } : {}),
    ctxPage,
    ctxFieldValue,
    ctxUserFieldValue,
    ctxExpressionValue,
    compileUIExpression,
    buildMetadataDebuggingModel,
    buildCalculatedContextDebuggingRows,
    formatMetadataValue,
    metadataOptionItemForField,
    metadataOptionToneClass,
    entryRepresentationFor,
    relatedCollectionMetadataFor,
    breadcrumbItems: ctx ? pageBreadcrumbItems(ctx) : [],
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
