import type { ResolvedSysBOUIView } from '@manatos/shared/metadata/ui';

import { entryPresentationDefinition } from '../runtime/v2/entry-presentation.js';
import { projectUiLayout, restoreUiLayoutInspectionProperties } from '../runtime/v2/layout.js';
import type { UiPresentationDefinition } from '../runtime/v2/presentation.js';
import type { UiCtxObject } from '../runtime/v2/ui-context.js';

interface BootstrapCtxPort {
  readonly value: UiCtxObject;
  get(path: string): unknown;
  replace(path: string, value: unknown, cause?: Readonly<Record<string, unknown>>): void;
}

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const componentDefinition = (component: string): UiPresentationDefinition => ({
  regions: [
    {
      id: 'content',
      role: 'content',
      composition: [{ key: 'content.0', kind: 'component', component }],
    },
  ],
});

/**
 * Typed presentation definition for a server/bootstrap-created root surface.
 * Bootstrap supplies facts and the initial topology; typed browser runtime owns
 * the logical presentation projection published into CTX.
 */
const bootstrapPresentationDefinition = (
  level: Readonly<Record<string, unknown>>,
): UiPresentationDefinition | undefined => {
  const control = record(level.control);
  const kind = text(control?.kind);
  const presentation = record(control?.presentation);

  if (kind === 'entry') {
    const uiView = record(presentation?.uiView);
    if (uiView) return entryPresentationDefinition(uiView as unknown as ResolvedSysBOUIView);
    return componentDefinition('entity-entry');
  }
  if (kind === 'list') {
    const definition = presentation?.definition;
    if (definition && typeof definition === 'object') return definition as UiPresentationDefinition;
    return componentDefinition('entity-list');
  }
  if (kind === 'hierarchy') {
    return {
      regions: [
        {
          id: 'summary',
          role: 'summary',
          composition: [
            { key: 'name', kind: 'component', component: 'hierarchy-name' },
            { key: 'member-count', kind: 'component', component: 'hierarchy-member-count' },
            { key: 'completion', kind: 'component', rendererRef: 'status:hierarchy-completion' },
          ],
        },
        {
          id: 'content',
          role: 'content',
          composition: [{ key: 'hierarchy', kind: 'component', component: 'entity-hierarchy' }],
        },
      ],
      chrome: {
        title: { rendererRef: 'title:surface' },
        actionsRendererRef: 'actions:surface',
        actions: [
          { key: 'dirty', kind: 'status', rendererRef: 'status:hierarchy-dirty', modes: ['edit'] },
          {
            key: 'draft-status',
            kind: 'status',
            rendererRef: 'status:hierarchy-draft',
            modes: ['create'],
          },
          {
            key: 'save-draft',
            kind: 'action',
            rendererRef: 'layout-action:save-draft',
            modes: ['create'],
          },
          {
            key: 'clear-all',
            kind: 'action',
            rendererRef: 'layout-action:clear-all',
            modes: ['create'],
          },
          { key: 'close', kind: 'action', rendererRef: 'layout-action:close' },
          { key: 'commit', kind: 'action', rendererRef: 'layout-action:commit' },
        ],
      },
    };
  }
  if (kind === 'static') return componentDefinition('static-page');
  return undefined;
};

/**
 * Adopt the bootstrap-created UI chain into typed presentation ownership once at
 * browser startup. This is deliberately not a CTX mirror/backfill mechanism:
 * later surfaces must publish their own layout when they are constructed.
 */
export const installBootstrapLayouts = (): void => {
  const ctx = window.ManatOS?.ctx as BootstrapCtxPort | undefined;
  if (!ctx?.get || !ctx?.replace)
    throw new Error('Bootstrap layout adoption requires canonical CTX.');

  let path = 'ctx.ui.level';
  for (;;) {
    const level = record(ctx.get(path));
    if (!level) break;
    const definition = bootstrapPresentationDefinition(level);
    const projected = projectUiLayout(level, definition);
    const child = record(level.level);
    const existingLayout = record(level.layout);

    if (projected) {
      if (child && existingLayout) {
        // This level is an already-established ancestor of the surface being
        // adopted. Its enumerable #layout is semantic inspection history and
        // must remain exactly intact. Restore only the non-enumerable browser
        // inspection Properties lost through JSON serialization.
        restoreUiLayoutInspectionProperties(existingLayout, projected);
      } else {
        // The current/new leaf keeps the proven projection path unchanged.
        ctx.replace(`${path}.layout`, projected, {
          source: 'bootstrap-layout',
          action: 'adopt-bootstrap-presentation',
          triggerPath: path,
        });
      }
    }
    if (!child) break;
    path += '.level';
  }
};
