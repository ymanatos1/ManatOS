import { describe, expect, it } from 'vitest';
import {
  CTX_NODE_PROPERTIES_SYMBOL_KEY,
  withCtxNodeProperties,
} from '../../src/runtime/v2/ctx-node-properties.js';
import { projectHierarchyMembersIntoLayout } from '../../src/runtime/v2/hierarchy-layout.js';
import { projectUiLayout, type UiLayoutProjection } from '../../src/runtime/v2/layout.js';
import type { UiPresentationDefinition } from '../../src/runtime/v2/presentation.js';

const presentation: UiPresentationDefinition = {
  tabs: [
    {
      id: 'general',
      label: 'General',
      regions: [
        {
          id: 'content',
          role: 'content',
          composition: [
            {
              key: 'column0',
              kind: 'column',
              span: 6,
              children: [
                { key: 'name', kind: 'field', field: 'name' },
                {
                  key: 'group',
                  kind: 'inline',
                  children: [{ key: 'enabled', kind: 'field', field: 'enabled' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  initialTabId: 'general',
};

const propertiesOf = (value: object | undefined): Readonly<Record<string, unknown>> =>
  value
    ? ((value as Record<symbol, Readonly<Record<string, unknown>>>)[
        Symbol.for(CTX_NODE_PROPERTIES_SYMBOL_KEY)
      ] ?? {})
    : {};

describe('UI-level logical layout CTX projection', () => {
  it('does not allocate a Properties sidecar when no properties exist', () => {
    const node = withCtxNodeProperties({}, null);
    expect(
      (node as Record<symbol, unknown>)[Symbol.for(CTX_NODE_PROPERTIES_SYMBOL_KEY)],
    ).toBeUndefined();
  });

  it('keeps topology in the value tree and node descriptors in non-enumerable Properties', () => {
    const surface = {
      control: { host: 'page', kind: 'entry' },
      data: { fields: { rogue: { value: 1 } } },
    };
    const layout = projectUiLayout(surface, presentation);
    const tabs = layout?.tabs;
    const general = tabs?.general;
    const column = general?.column0;
    const name = column?.name;

    expect(Object.keys(layout ?? {})).toEqual(['tabs']);
    expect(JSON.stringify(layout)).not.toContain('"regions"');
    expect(Object.keys(general ?? {})).toEqual(['column0']);
    expect(Object.keys(column ?? {})).toEqual(['name', 'group']);
    expect(JSON.stringify(layout)).not.toContain('"children"');
    expect(propertiesOf(layout ?? undefined)).toMatchObject({
      contractVersion: 1,
      authority: 'inspection',
      host: 'page',
      surface: 'entry',
    });
    expect(propertiesOf(general)).toMatchObject({ key: 'general', kind: 'tab', label: 'General' });
    expect(propertiesOf(general)).toMatchObject({
      rendererRef: 'tab:general',
      domSelector: '[data-v2-tab-id="general"]',
    });
    expect(propertiesOf(column)).toMatchObject({
      key: 'column0',
      kind: 'column',
      span: 6,
      rendererRef: 'column:general:column0',
      domSelector: '[data-v2-layout-column="general:column0"]',
    });
    expect(propertiesOf(name)).toMatchObject({
      key: 'name',
      kind: 'field',
      field: 'name',
      rendererRef: 'field:name',
      domSelector: '[data-ctx-field-container="name"]',
    });
    expect(JSON.stringify(layout)).not.toContain('rogue');
    expect(JSON.stringify(layout)).not.toMatch(
      /contractVersion|authority|host|surface|kind|role|field|selector|className|element|geometry|value/i,
    );
  });

  it('is invariant when semantic data changes', () => {
    const first = projectUiLayout(
      { control: { host: 'page', kind: 'entry' }, data: { fields: { name: { value: 'A' } } } },
      presentation,
    );
    const second = projectUiLayout(
      { control: { host: 'page', kind: 'entry' }, data: { fields: { other: { value: 'B' } } } },
      presentation,
    );
    expect(second).toEqual(first);
    expect(propertiesOf(second ?? undefined)).toEqual(propertiesOf(first ?? undefined));
  });

  it('does not invent uninspectable page/popup chrome nodes', () => {
    const layout = projectUiLayout({ control: { host: 'popup', kind: 'entry' } }, presentation);
    expect(propertiesOf(layout ?? undefined)).toMatchObject({
      authority: 'inspection',
      host: 'popup',
    });
    expect(layout?.header).toBeUndefined();
    expect(layout?.footer).toBeUndefined();
    expect(layout?.tabs?.general?.content).toBeUndefined();
  });

  it('does not invent host chrome for embedded surfaces', () => {
    const layout = projectUiLayout({ control: { host: 'embedded', kind: 'entry' } }, presentation);
    expect(layout?.tabs).toBeDefined();
    expect(layout?.header).toBeUndefined();
    expect(layout?.footer).toBeUndefined();
  });
});

it('reprojects hierarchy members from current state without retaining stale member nodes', () => {
  const base = { content: { hierarchy: {}, 'member-1': {} } } as UiLayoutProjection;
  const first = projectHierarchyMembersIntoLayout(
    base,
    [
      { id: 'root', parentId: null, name: 'Root' },
      { id: 'child', parentId: 'root', name: 'Child' },
    ],
    'id',
    'parentId',
    (row) => String(row.name),
  );
  expect(Object.keys(first.content ?? {})).toEqual(['member-1']);
  expect(propertiesOf(first.content?.['member-1'])).toMatchObject({ identity: 'root' });
  expect(propertiesOf(first.content?.['member-1']?.['member-2'])).toMatchObject({
    identity: 'child',
  });

  const second = projectHierarchyMembersIntoLayout(
    first,
    [{ id: 'child', parentId: null, name: 'Child' }],
    'id',
    'parentId',
    (row) => String(row.name),
  );
  expect(Object.keys(second.content ?? {})).toEqual(['member-1']);
  expect(propertiesOf(second.content?.['member-1'])).toMatchObject({ identity: 'child' });
  expect(second.content?.['member-1']?.['member-2']).toBeUndefined();

  const empty = projectHierarchyMembersIntoLayout(second, [], 'id', 'parentId', (row) =>
    String(row.name),
  );
  expect(Object.keys(empty.content ?? {})).toEqual([]);

  const restored = projectHierarchyMembersIntoLayout(
    empty,
    [{ id: 'restored', parentId: null, name: 'Restored' }],
    'id',
    'parentId',
    (row) => String(row.name),
  );
  expect(Object.keys(restored.content ?? {})).toEqual(['member-1']);
  expect(propertiesOf(restored.content?.['member-1'])).toMatchObject({ identity: 'restored' });
});

describe('UI-level inspectable presentation chrome', () => {
  it('uses host-aware page titles and popup captions and omits non-rendered terminal actions', () => {
    const definition: UiPresentationDefinition = {
      chrome: {
        title: { rendererRef: 'title:surface' },
        actions: [{ key: 'close', kind: 'action', rendererRef: 'layout-action:close' }],
      },
    };
    const page = projectUiLayout(
      { control: { host: 'page', kind: 'entry', presentation: { title: 'Page title' } } },
      definition,
    );
    const popup = projectUiLayout(
      { control: { host: 'popup', kind: 'entry', presentation: { title: 'Popup caption' } } },
      definition,
    );
    const actionless = projectUiLayout(
      {
        control: {
          host: 'page',
          kind: 'entry',
          presentation: { title: 'Account', actionsVisible: false },
        },
      },
      definition,
    );

    expect(propertiesOf(page?.title)).toMatchObject({ value: 'Page title' });
    expect(page?.caption).toBeUndefined();
    expect(propertiesOf(popup?.caption)).toMatchObject({
      kind: 'caption',
      value: 'Popup caption',
      rendererRef: 'caption:surface',
      domSelector: '[data-v2-layout-caption="surface"]',
    });
    expect(popup?.title).toBeUndefined();
    expect(actionless?.actions).toBeUndefined();
  });

  it('projects rendered title and action/state descriptors without changing body topology', () => {
    const definition: UiPresentationDefinition = {
      regions: [{ id: 'body', role: 'content', composition: [] }],
      chrome: {
        title: { rendererRef: 'title:surface' },
        actionsRendererRef: 'actions:surface',
        actions: [
          { key: 'state', kind: 'status', rendererRef: 'status:state' },
          { key: 'save', kind: 'action', label: 'Save', rendererRef: 'layout-action:save' },
        ],
      },
    };
    const layout = projectUiLayout(
      { control: { host: 'page', kind: 'entry', presentation: { title: 'Edit entry' } } },
      definition,
    );

    expect(propertiesOf(layout?.title)).toMatchObject({
      kind: 'title',
      value: 'Edit entry',
      rendererRef: 'title:surface',
      domSelector: '[data-v2-layout-title="surface"]',
    });
    expect(propertiesOf(layout?.actions)).toMatchObject({
      kind: 'actions',
      rendererRef: 'actions:surface',
    });
    expect(propertiesOf(layout?.actions?.state?.state)).toMatchObject({
      kind: 'status',
      rendererRef: 'status:state',
    });
    expect(propertiesOf(layout?.actions?.save)).toMatchObject({
      kind: 'action',
      rendererRef: 'layout-action:save',
    });
  });
});

it('restores inspection properties without changing serialized ancestor layout topology or identity', async () => {
  const { restoreUiLayoutInspectionProperties } = await import('../../src/runtime/v2/layout.js');
  const projected = projectUiLayout({ control: { host: 'page', kind: 'entry' } }, presentation);
  const serialized = JSON.parse(JSON.stringify(projected)) as UiLayoutProjection;
  const originalRoot = serialized;
  const originalGeneral = serialized.tabs?.general;
  const before = JSON.stringify(serialized);

  restoreUiLayoutInspectionProperties(serialized, projected);

  expect(serialized).toBe(originalRoot);
  expect(serialized.tabs?.general).toBe(originalGeneral);
  expect(JSON.stringify(serialized)).toBe(before);
  expect(propertiesOf(serialized.tabs?.general)).toMatchObject({
    key: 'general',
    kind: 'tab',
    rendererRef: 'tab:general',
  });
  expect(propertiesOf(serialized.tabs?.general?.column0?.name)).toMatchObject({
    field: 'name',
    rendererRef: 'field:name',
  });
});
