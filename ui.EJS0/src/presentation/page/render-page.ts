import ejs from 'ejs';
import type { Response } from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { config } from '../../config.js';

import { hasUIEntityPermission } from '../../sysbo/permissions.js';
import { sysBODefinitions } from '../../sysbo/definitions.js';
import { popupContent } from '../popup/popup-content.js';
import {
  buildCalculatedContextDebuggingRows,
  buildMetadataDebuggingModel,
} from '../metadata/debugging-model.js';
import {
  formatMetadataValue,
  metadataFieldRepresentation,
  metadataOptionItemForField,
  metadataOptionToneClass,
} from '../metadata/value-presentation.js';
import {
  describeRelatedCollectionField,
  resolveProjectedRelatedCollectionValue,
} from '../metadata/related-field-presentation.js';
import {
  MANATOS_COMPANY,
  resolvePlatform,
  allManatOSObjectMetadata,
  allSysBOUIMetadata,
  resolveEntryRepresentation,
  type ExpressionDiagnostic,
  type ManatOSContext,
  type ManatOSObjectMetadata,
  enumItemsForField,
  enumValuesForField,
} from '@manatos/shared';
import {
  persistedCollectionPictureSource,
  persistedScalarPictureSource,
} from '@manatos/shared/presentation/picture-value';

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
    persistedScalarPictureSource,
    persistedCollectionPictureSource,
  };

  const ctx = viewModel.ctx as ManatOSContext | undefined;

  /*
   * The error handler can render after page-context hydration failed before it
   * published res.locals.app (for example when an idle API session expires
   * during authenticated-user/capability hydration). The shell is still the
   * canonical error/navigation host, so keep its render contract complete.
   *
   * This is deliberately an anonymous, presentation-safe fallback rather than
   * exposing server configuration or teaching EJS to probe for missing `app`.
   * Normal pages continue to consume the richer projection owned by
   * page-context middleware.
   */
  const shellApp =
    viewModel.app ??
    Object.freeze({
      version: '0.1.0',
      company: MANATOS_COMPANY,
      currentPlatform: resolvePlatform(MANATOS_COMPANY),
      scopes: Object.freeze({ workspace: Object.freeze({ application: null }) }),
      sysBO: Object.freeze({}),
      navigation: Object.freeze({ horizontal: [], vertical: [] }),
      ui: Object.freeze({
        navigationStatePersistence: config.UI_NAVIGATION_STATE_PERSISTENCE,
        debugTools: config.NODE_ENV !== 'production',
        allowAdminEmailVerification: config.ALLOW_ADMIN_EMAIL_VERIFICATION,
        bootstrap: null,
      }),
    });

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
      { entityIcon: entityIcon ?? sysBODefinitions[entityKey]?.icon ?? null },
    );
  };

  /**
   * Consume the canonical presentation already projected onto a reference-data row.
   * Reference catalogues are built by the shared data-access pipeline, which owns
   * entry-name/icon resolution. Views must not recreate that policy.
   */
  const projectedReferenceRepresentation = (reference: unknown, fallback: unknown = '') => {
    if (!reference || typeof reference !== 'object' || Array.isArray(reference)) {
      return { name: fallback == null ? '' : String(fallback), icons: [] as string[] };
    }
    const row = reference as Readonly<Record<string, unknown>>;
    const icons = Array.isArray(row.__entryIcons)
      ? row.__entryIcons.filter(
          (icon): icon is string => typeof icon === 'string' && icon.length > 0,
        )
      : typeof row.__entryIcon === 'string' && row.__entryIcon
        ? [row.__entryIcon]
        : typeof row.__entityIcon === 'string' && row.__entityIcon
          ? [row.__entityIcon]
          : [];
    return {
      name:
        typeof row.__entryName === 'string' && row.__entryName.length > 0
          ? row.__entryName
          : fallback == null
            ? ''
            : String(fallback),
      icons,
    };
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
    app: shellApp,
    // Error/navigation rendering may run after page-context hydration itself
    // failed. Keep the complete shell/partials contract defined in that case.
    currentUser: viewModel.currentUser ?? null,
    ...(ctx ? { ctx } : {}),
    browserCtx,
    ctxUserFieldValue,
    buildMetadataDebuggingModel,
    buildCalculatedContextDebuggingRows,
    formatMetadataValue,
    metadataFieldRepresentation,
    metadataOptionItemForField,
    metadataOptionToneClass,
    describeRelatedCollectionField,
    resolveProjectedRelatedCollectionValue,
    enumItemsForField,
    enumValuesForField,
    entryRepresentationFor,
    projectedReferenceRepresentation,
    relatedCollectionMetadataFor,
    hasUIEntityPermission,
    breadcrumbItems: Array.isArray(viewModel.breadcrumbItems) ? viewModel.breadcrumbItems : [],
    relatedEntityMetadata: allManatOSObjectMetadata,
    relatedEntityUIMetadata: allSysBOUIMetadata,
    ctxDiagnostics,
    uiBootId,
  };

  const body = await ejs.renderFile(resolve(viewsDirectory, `${view}.ejs`), renderedModel);

  // Direct browser hosts reuse the canonical SSR renderer without creating a
  // second document/application shell. The response carries factual bootstrap
  // state beside host-neutral markup; the outer UiRuntime remains topology owner.
  if (viewModel.directHostFragment === true) {
    res.json({
      success: true,
      data: {
        html: body,
        title: typeof viewModel.title === 'string' ? viewModel.title : '',
        bootstrap: viewModel.uiBootstrap ?? null,
        context: browserCtx,
      },
    });
    return;
  }

  res.render('layout/shell', {
    ...renderedModel,
    body,
  });
}
