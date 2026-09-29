import type { ResolvedSysBOUIView } from '@manatos/shared/metadata/ui';

import {
  UiPresentationInstance,
  type UiCompositionNode,
  type UiPresentationDefinition,
} from './presentation.js';
import type { UiContext } from './ui-context.js';
import type { UiLevel } from './ui-level.js';

export type EntityEntryPresentationFactory = (
  level: UiLevel,
  context: UiContext,
  view: ResolvedSysBOUIView,
) => UiPresentationInstance;

/**
 * Convert one fully resolved entry uiView into host-neutral presentation structure.
 * Components are attached by later component/materialization stages; this planner owns
 * only view structure and never semantic entry state.
 */
const composition = (
  content: readonly import('@manatos/shared/metadata/ui').SysBOUITabContentMetadata[] | undefined,
): readonly UiCompositionNode[] => {
  const used = new Map<string, number>();
  const structural = new Map<string, number>();
  const unique = (base: string): string => {
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  };
  const structuralKey = (kind: string): string => {
    const index = structural.get(kind) ?? 0;
    structural.set(kind, index + 1);
    return unique(`${kind}${index}`);
  };

  return (content ?? []).map((item) => {
    switch (item.kind) {
      case 'field':
        return {
          key: unique(item.field),
          kind: 'field',
          field: item.field,
          ...(item.representation ? { representation: item.representation } : {}),
          ...(item.label ? { label: item.label } : {}),
        };
      case 'action':
        return { key: unique(item.action), kind: 'action', action: item.action };
      case 'collection':
        return { key: unique(item.collection), kind: 'collection', collection: item.collection };
      case 'component':
        return {
          key: unique(item.component.key),
          kind: 'component',
          component: item.component.key,
        };
      case 'column':
      case 'inline':
        return {
          key: structuralKey(item.kind),
          kind: item.kind,
          ...(item.kind === 'column' && typeof item.span === 'number' ? { span: item.span } : {}),
          children: composition(item.content),
        };
      case 'break':
      case 'spacer':
        return { key: structuralKey(item.kind), kind: item.kind };
    }
  });
};

const entryChrome = (): NonNullable<UiPresentationDefinition['chrome']> => ({
  title: { rendererRef: 'title:surface' },
  actionsRendererRef: 'actions:surface',
  actions: [
    {
      key: 'formState',
      kind: 'status',
      label: 'Form state',
      rendererRef: 'status:form-state',
      modes: ['create', 'edit'],
    },
    {
      key: 'close',
      kind: 'action',
      label: 'Close / Cancel',
      rendererRef: 'layout-action:close',
    },
    {
      key: 'save',
      kind: 'action',
      label: 'Save',
      rendererRef: 'layout-action:save',
      modes: ['create', 'edit'],
    },
  ],
});

export function entryPresentationDefinition(view: ResolvedSysBOUIView): UiPresentationDefinition {
  const record = view.metadata.record;
  // A view may reuse one metadata tab as a grouping container while explicitly
  // suppressing tab navigation (for example Principal `quick`).  Presentation
  // topology follows the physical surface, not the metadata storage shape: such
  // a single group is projected as direct content, never as a synthetic tab.
  if (record.tabNavigationVisible === false && record.tabs.length === 1) {
    return {
      regions: [
        {
          id: 'content',
          role: 'content',
          composition: composition(record.tabs[0]?.content),
        },
      ],
      chrome: entryChrome(),
    };
  }
  if (record.tabs.length > 0) {
    const tabs = [...record.tabs]
      .sort((left, right) => left.order - right.order)
      .map((tab) => ({
        id: tab.id,
        label: tab.label,
        regions: [
          {
            id: 'content',
            role: 'content',
            composition: composition(tab.content),
          },
        ],
      }));
    const initialTabId = tabs[0]?.id;
    const chrome = entryChrome();
    return initialTabId === undefined ? { tabs, chrome } : { tabs, initialTabId, chrome };
  }
  return {
    regions: [{ id: 'content', role: 'content', composition: composition(record.content) }],
    chrome: entryChrome(),
  };
}

export const createEntityEntryPresentation: EntityEntryPresentationFactory = (
  level,
  context,
  view,
) => new UiPresentationInstance(level, context, entryPresentationDefinition(view));
