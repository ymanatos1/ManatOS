import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SysBOUIMetadata } from '@manatos/shared/metadata/ui';
import { resolveSysBOUIView } from '@manatos/shared/metadata/ui';
import { entryPresentationDefinition } from '../../src/runtime/v2/entry-presentation.js';
import { projectUiLayout } from '../../src/runtime/v2/layout.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));

const metadata: SysBOUIMetadata = {
  key: 'AnyEntity',
  list: {
    common: {
      visibleFields: [],
      filterFields: [],
      sortableFields: [],
      addAction: { visible: true, label: 'Add' },
    },
    views: { main: { label: 'Standard' } },
  },
  record: {
    tabs: [
      { id: 'later', label: 'Later', order: 20 },
      { id: 'first', label: 'First', order: 10, content: [{ kind: 'field', field: 'name' }] },
    ],
    fieldOverrides: {},
  },
  defaultUIView: 'main',
  uiViews: {
    main: { viewType: 'full', label: 'Standard' },
    quick: { viewType: 'quick', label: 'Quick', record: { tabs: [], content: [] } },
  },
};

describe('V2 entry presentation planning', () => {
  it('derives host-neutral tab structure from the fully resolved uiView without entity dispatch', () => {
    const definition = entryPresentationDefinition(resolveSysBOUIView(metadata, 'main'));
    expect(definition.tabs?.map((tab) => tab.id)).toEqual(['first', 'later']);
    expect(definition.initialTabId).toBe('first');
    expect(definition.tabs?.[0]?.regions[0]?.composition).toEqual([
      { key: 'name', kind: 'field', field: 'name' },
    ]);
  });

  it('uses a generic content region for a resolved linear/quick view', () => {
    const definition = entryPresentationDefinition(resolveSysBOUIView(metadata, 'quick'));
    expect(definition.tabs).toBeUndefined();
    expect(definition.regions).toEqual([{ id: 'content', role: 'content', composition: [] }]);
  });

  it('projects a single metadata grouping tab as direct content when tab navigation is suppressed', () => {
    const tabless = structuredClone(metadata);
    tabless.uiViews.quick = {
      viewType: 'quick',
      label: 'Quick',
      record: {
        tabNavigationVisible: false,
        tabs: [
          {
            id: 'quick',
            label: 'Quick',
            order: 10,
            content: [
              { kind: 'field', field: 'name' },
              { kind: 'field', field: 'enabled' },
            ],
          },
        ],
        content: [],
      },
    };

    const definition = entryPresentationDefinition(resolveSysBOUIView(tabless, 'quick'));
    expect(definition.tabs).toBeUndefined();
    expect(definition.initialTabId).toBeUndefined();
    expect(definition.regions).toEqual([
      {
        id: 'content',
        role: 'content',
        composition: [
          { key: 'name', kind: 'field', field: 'name' },
          { key: 'enabled', kind: 'field', field: 'enabled' },
        ],
      },
    ]);

    const layout = projectUiLayout(
      { control: { host: 'popup', kind: 'entry', mode: 'view', presentation: {} } },
      definition,
    );
    expect(layout).not.toBeNull();
    expect(layout).toHaveProperty('content.name');
    expect(layout).toHaveProperty('content.enabled');
    expect(layout).not.toHaveProperty('tabs');
  });

  it('uses semantic leaf keys and structural kind indexes instead of positional path keys', () => {
    const rich = structuredClone(metadata);
    rich.record.tabs[0] = {
      id: 'later',
      label: 'Later',
      order: 20,
      content: [
        {
          kind: 'column',
          span: 6,
          content: [
            { kind: 'field', field: 'name' },
            { kind: 'action', action: 'save' },
          ],
        },
        { kind: 'column', content: [{ kind: 'field', field: 'name' }] },
      ],
    };
    const definition = entryPresentationDefinition(resolveSysBOUIView(rich, 'main'));
    const later = definition.tabs?.find((tab) => tab.id === 'later');
    expect(later?.regions[0]?.composition?.map((node) => node.key)).toEqual(['column0', 'column1']);
    expect(later?.regions[0]?.composition?.[0]?.span).toBe(6);
    expect(later?.regions[0]?.composition?.[0]?.children?.map((node) => node.key)).toEqual([
      'name',
      'save',
    ]);
    expect(later?.regions[0]?.composition?.[1]?.children?.map((node) => node.key)).toEqual([
      'name',
    ]);
  });

  it('keeps SSR entry topology sourced from the same typed presentation projection as #layout', async () => {
    const renderer = await readFile(
      resolve(testDirectory, '..', '..', 'src/routes/sysbo/entry/renderer.ts'),
      'utf8',
    );
    const entry = await readFile(
      resolve(testDirectory, '..', '..', 'views/components/runtime/entity-entry.ejs'),
      'utf8',
    );

    expect(renderer).toContain('const entryPresentation = entryPresentationDefinition({');
    expect(renderer).toContain('entryPresentation,');
    expect(entry).toContain('const projectedPresentation =');
    expect(entry).toContain('const showTabNavigation = projectedTabs.length > 0;');
    expect(entry).not.toContain(
      'showTabNavigation = metadataUI.record.tabNavigationVisible !== false',
    );
  });
});
