import {
  CTX_NODE_PROPERTIES_SYMBOL_KEY,
  ctxNodePropertiesOf,
  withCtxNodeProperties,
} from './ctx-node-properties.js';
import type {
  UiCompositionNode,
  UiPresentationDefinition,
  UiRegionDefinition,
} from './presentation.js';

/** Inspection-only projection of the canonical typed presentation/composition model. */
export type UiLayoutNodeKind =
  | 'region'
  | 'tab'
  | 'title'
  | 'caption'
  | 'content'
  | 'actions'
  | 'status'
  | 'field'
  | 'break'
  | 'spacer'
  | 'column'
  | 'inline'
  | 'action'
  | 'collection'
  | 'component';

/**
 * Layout topology is direct: enumerable members are child layout nodes. There
 * is deliberately no `children` wrapper in the inspection contract.
 */
export interface UiLayoutNode {
  readonly [key: string]: UiLayoutNode;
}

export interface UiLayoutProjection {
  readonly [key: string]: UiLayoutNode;
}

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const rendererDomSelector = (rendererRef: string): string | undefined => {
  const split = rendererRef.indexOf(':');
  if (split <= 0) return undefined;
  const kind = rendererRef.slice(0, split);
  const key = rendererRef
    .slice(split + 1)
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"');
  const attributes: Readonly<Record<string, string>> = {
    field: 'data-ctx-field-container',
    action: 'data-v2-entry-action',
    collection: 'data-collection-source-key',
    component: 'data-metadata-component',
    'component-instance': 'data-v2-layout-component-instance',
    column: 'data-v2-layout-column',
    tab: 'data-v2-tab-id',
    title: 'data-v2-layout-title',
    caption: 'data-v2-layout-caption',
    status: 'data-v2-layout-status',
    'list-action': 'data-v2-list-action',
    'layout-action': 'data-v2-layout-action',
    'list-part': 'data-v2-list-part',
    'list-field': 'data-list-field',
    'list-filter-field': 'data-v2-list-filter-field',
    'list-filter-action': 'data-v2-list-filter-action',
    region: 'data-v2-layout-region',
    actions: 'data-v2-layout-actions',
    'list-actions': 'data-v2-list-actions',
  };
  const attribute = attributes[kind];
  return attribute ? `[${attribute}="${key}"]` : undefined;
};

const rendererProperties = (rendererRef?: string): Readonly<Record<string, string>> => {
  if (!rendererRef) return {};
  const domSelector = rendererDomSelector(rendererRef);
  return { rendererRef, ...(domSelector ? { domSelector } : {}) };
};

const rendererReference = (
  node: UiCompositionNode,
  structuralScope?: string,
): Readonly<Record<string, string>> => {
  if (node.rendererRef) return rendererProperties(node.rendererRef);
  if (node.field) return rendererProperties(`field:${node.field}`);
  if (node.action) return rendererProperties(`action:${node.action}`);
  if (node.collection) return rendererProperties(`collection:${node.collection}`);
  if (node.component) return rendererProperties(`component-instance:${node.key}`);
  if (node.kind === 'column' && structuralScope) {
    return rendererProperties(`column:${structuralScope}:${node.key}`);
  }
  return {};
};

const compositionNode = (node: UiCompositionNode, structuralScope?: string): UiLayoutNode =>
  withCtxNodeProperties(
    node.children?.length
      ? Object.fromEntries(
          node.children.map((child) => [child.key, compositionNode(child, structuralScope)]),
        )
      : {},
    {
      key: node.key,
      kind: node.kind,
      ...(node.field ? { field: node.field } : {}),
      ...(node.action ? { action: node.action } : {}),
      ...(node.collection ? { collection: node.collection } : {}),
      ...(node.component ? { component: node.component } : {}),
      ...(node.representation ? { representation: node.representation } : {}),
      ...(node.label ? { label: node.label } : {}),
      ...(typeof node.span === 'number' ? { span: node.span } : {}),
      ...rendererReference(node, structuralScope),
    },
  );

const regionNode = (
  region: UiRegionDefinition,
  key = region.id,
  structuralScope?: string,
): UiLayoutNode =>
  withCtxNodeProperties(
    region.composition?.length
      ? Object.fromEntries(
          region.composition.map((node) => [node.key, compositionNode(node, structuralScope)]),
        )
      : {},
    {
      key,
      kind: 'region',
      ...(region.role ? { role: region.role } : {}),
      ...rendererProperties(region.role ? `region:${region.role}` : undefined),
    },
  );

const presentationRegions = (
  definition?: UiPresentationDefinition,
): Record<string, UiLayoutNode> => {
  if (!definition) return {};
  const regions: Record<string, UiLayoutNode> = Object.fromEntries(
    (definition.regions ?? []).map((region) => [
      region.id,
      regionNode(region, region.id, region.id),
    ]),
  );
  if (definition.tabs?.length) {
    regions.tabs = withCtxNodeProperties(
      Object.fromEntries(
        definition.tabs.map((tab) => {
          const tabChildren: Record<string, UiLayoutNode> = {};
          for (const region of tab.regions) {
            const projected = regionNode(region, region.id, tab.id);
            // `content` is the ordinary tab body, not a meaningful extra layout level.
            if (region.id === 'content' && region.role === 'content') {
              Object.assign(tabChildren, projected);
            } else {
              tabChildren[region.id] = projected;
            }
          }
          return [
            tab.id,
            withCtxNodeProperties(tabChildren, {
              key: tab.id,
              kind: 'tab',
              ...(tab.label ? { label: tab.label } : {}),
              ...rendererProperties(`tab:${tab.id}`),
            }),
          ];
        }),
      ),
      { key: 'tabs', kind: 'region', role: 'tabs' },
    );
  }
  return regions;
};

/**
 * Project one UI level from typed presentation structure. Semantic `data.*` is deliberately
 * ignored: changing record values cannot create or remove logical presentation nodes.
 */
export const projectUiLayout = (
  surfaceValue: unknown,
  definition?: UiPresentationDefinition,
): UiLayoutProjection | null => {
  const surface = record(surfaceValue);
  const control = record(surface?.control);
  const host = text(control?.host);
  const kind = text(control?.kind);
  if (!surface || !control || !host || !kind) return null;

  const body = presentationRegions(definition);
  const content: Record<string, UiLayoutNode> = {};
  const presentation = record(control.presentation);
  const title = text(presentation?.title);
  if (title) {
    const headingKey = host === 'popup' ? 'caption' : 'title';
    content[headingKey] = withCtxNodeProperties(
      {},
      {
        key: headingKey,
        kind: headingKey,
        value: title,
        ...rendererProperties(
          host === 'popup'
            ? 'caption:surface'
            : (definition?.chrome?.title?.rendererRef ?? 'title:surface'),
        ),
      },
    );
  }
  Object.assign(content, body);
  if (presentation?.actionsVisible !== false && definition?.chrome?.actions?.length) {
    const mode = text(control.mode);
    const visibleChrome = definition.chrome.actions.filter(
      (item) => !item.modes?.length || (mode !== undefined && item.modes.includes(mode)),
    );
    const stateNodes = visibleChrome.filter((item) => item.kind === 'status');
    const actionNodes = visibleChrome.filter((item) => item.kind === 'action');
    const actionChildren: Record<string, UiLayoutNode> = {};
    if (stateNodes.length) {
      actionChildren.state = withCtxNodeProperties(
        Object.fromEntries(
          stateNodes.map((item) => [
            item.key,
            withCtxNodeProperties(
              {},
              {
                key: item.key,
                kind: 'status',
                ...(item.label ? { label: item.label } : {}),
                ...rendererProperties(item.rendererRef),
              },
            ),
          ]),
        ),
        { key: 'state', kind: 'status' },
      );
    }
    for (const item of actionNodes) {
      actionChildren[item.key] = withCtxNodeProperties(
        {},
        {
          key: item.key,
          kind: 'action',
          ...(item.label ? { label: item.label } : {}),
          ...rendererProperties(item.rendererRef),
        },
      );
    }
    if (visibleChrome.length) {
      content.actions = withCtxNodeProperties(actionChildren, {
        key: 'actions',
        kind: 'actions',
        ...rendererProperties(definition.chrome.actionsRendererRef),
      });
    }
  }

  return withCtxNodeProperties(content, {
    contractVersion: 1,
    authority: 'inspection',
    host,
    surface: kind,
  });
};

/**
 * Restore the non-enumerable inspection Properties lost at the server/JSON/browser
 * boundary without replacing or rebuilding an already-established layout value.
 * Only nodes already present in the serialized topology are decorated; enumerable
 * topology and object identity remain untouched.
 */
export const restoreUiLayoutInspectionProperties = (
  existing: unknown,
  projected: unknown,
): void => {
  const current = record(existing);
  const source = record(projected);
  if (!current || !source) return;

  const properties = ctxNodePropertiesOf(source);
  if (properties && !ctxNodePropertiesOf(current)) {
    Object.defineProperty(current, Symbol.for(CTX_NODE_PROPERTIES_SYMBOL_KEY), {
      value: properties,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  for (const key of Object.keys(current)) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    restoreUiLayoutInspectionProperties(current[key], source[key]);
  }
};
