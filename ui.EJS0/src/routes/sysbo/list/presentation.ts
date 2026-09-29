import type { SysBOUIListMetadata } from '@manatos/shared';

import type { UiPresentationDefinition } from '../../../runtime/v2/presentation.js';

/**
 * Canonical renderer-neutral presentation for one resolved entity-list uiView.
 * Every route that reconstructs a parent List UiLevel must use this definition;
 * child navigation must not degrade the parent's #layout to a fallback component.
 */
export function listPresentationDefinition(
  metadata: SysBOUIListMetadata,
): UiPresentationDefinition {
  return {
    regions: [
      {
        id: 'toolbar',
        role: 'toolbar',
        composition: [
          {
            key: 'count',
            kind: 'component',
            component: 'list-count',
            rendererRef: 'list-part:count',
          },
          ...(metadata.filterFields.length
            ? [
                {
                  key: 'filters',
                  kind: 'component' as const,
                  component: 'list-filters',
                  rendererRef: 'list-part:filters',
                },
              ]
            : []),
          {
            key: 'search',
            kind: 'component',
            component: 'list-search',
            rendererRef: 'list-part:search',
          },
          ...Object.entries(metadata.pageActions || {}).map(([key, action]) => ({
            key,
            kind: 'action' as const,
            action: key,
            label: action.label,
            rendererRef: `list-action:page:${key}`,
          })),
          {
            key: 'add',
            kind: 'action',
            action: 'add',
            label: metadata.addAction.label,
            rendererRef: 'list-action:add',
          },
        ],
      },
      ...(metadata.filterFields.length
        ? [
            {
              id: 'filters',
              role: 'filters',
              composition: [
                ...metadata.filterFields.map((field) => ({
                  key: field,
                  kind: 'field' as const,
                  field,
                  rendererRef: `list-filter-field:${field}`,
                })),
                {
                  key: 'apply',
                  kind: 'action' as const,
                  action: 'apply',
                  label: 'Filter',
                  rendererRef: 'list-filter-action:apply',
                },
                {
                  key: 'clear',
                  kind: 'action' as const,
                  action: 'clear',
                  label: 'Clear',
                  rendererRef: 'list-filter-action:clear',
                },
              ],
            },
          ]
        : []),
      {
        id: 'list',
        role: 'list',
        composition: metadata.visibleFields.map((field) => ({
          key: field,
          kind: 'field',
          field,
          rendererRef: `list-field:${field}`,
        })),
      },
      {
        id: 'pagination',
        role: 'pagination',
        composition: [
          {
            key: 'paging',
            kind: 'component',
            component: 'list-paging',
            rendererRef: 'list-part:paging',
          },
        ],
      },
    ],
    chrome: { title: { rendererRef: 'title:surface' } },
  };
}
