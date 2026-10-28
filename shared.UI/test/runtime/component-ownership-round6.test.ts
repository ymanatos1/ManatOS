import { describe, expect, it } from 'vitest';
import {
  appendContextPathMember,
  ContextTreeRuntime,
  type ManatOSRuntimeRootContext,
} from '@manatos/shared';
import { UiSurfaceEmbeddedRuntime } from '../../src/runtime/surface/embedded-runtime.js';
import { UiSurfaceHostRuntime } from '../../src/runtime/surface/host-runtime.js';
import {
  createUiSemanticLayoutNode,
  UI_LAYOUT_NODE_PROPERTIES,
} from '../../src/runtime/layout/node.js';
import { createPopupEmbeddedRegistry } from '../../src/popups/embedded/registry.js';
import { createEntryEmbeddedRegistry } from '../../src/components/entry/embedded/registry.js';
import type { EntryDefinition } from '../../src/components/entry/embedded/Entry.js';
import { SIGN_IN_POPUP } from '../../src/popups/auth/definitions.js';
import type { UiPopupCredentialsDefinition } from '../../src/popups/popup-definition.js';
import { UNSAVED_CHANGES_POPUP } from '../../src/popups/unsaved-changes-definition.js';
import { UiPopupRuntime } from '../../src/popups/popup-runtime.js';
import { UiEntryPageRuntime } from '../../src/components/entry/EntryRuntime.js';
import { UiListPageRuntime } from '../../src/components/list/ListPageRuntime.js';

const tree = () =>
  new ContextTreeRuntime({ ui: {} }) as unknown as ContextTreeRuntime<ManatOSRuntimeRootContext>;

/** Auth components must not depend on Popup #state.tab or a Popup-only mounting path. */
describe('UIS component ownership across hosts', () => {
  it('requires registered popup and structural Entry owners to declare their root metadata', () => {
    const popupRegistry = createPopupEmbeddedRegistry();
    const declarations = [
      { id: 'title', kind: 'popup-title' },
      { id: 'tabs', kind: 'popup-tabs', views: [] },
      { id: 'close', kind: 'popup-title-tool' },
      { id: 'signin', kind: 'popup-tab' },
      { id: 'content', kind: 'popup-view' },
      { id: 'actions', kind: 'popup-actions', tabId: 'signin' },
      { id: 'section', kind: 'section' },
      { id: 'intro', kind: 'intro' },
      { id: 'note', kind: 'note' },
      { id: 'notice', kind: 'notice' },
      { id: 'emailMethod', kind: 'email-method' },
      { id: 'credentials', kind: 'auth-credentials' },
      { id: 'identity', kind: 'auth-credential-field', scopeId: 'signin' },
      { id: 'passwordGuidance', kind: 'auth-password-guidance', scopeId: 'signin' },
      { id: 'google', kind: 'auth-provider-action', scopeId: 'signin' },
      { id: 'providers', kind: 'external-providers' },
    ];
    for (const definition of declarations) {
      const component = popupRegistry.get(definition.kind)?.create(definition);
      const root = component?.createLayoutNode?.();
      expect(
        root ? Object.getOwnPropertyDescriptor(root, UI_LAYOUT_NODE_PROPERTIES)?.value : undefined,
      ).toMatchObject({
        key: definition.id,
        rendererRef: `popup:${definition.id}`,
      });
    }

    const entryRegistry = createEntryEmbeddedRegistry();
    for (const kind of ['entry-layout-group', 'entry-layout-slot']) {
      const component = entryRegistry.get(kind)?.create({
        id: 'structure',
        kind,
        entityKey: 'sys-users',
        selector: '[data-entry-layout-id="structure"]',
      } as EntryDefinition);
      const root = component?.createLayoutNode?.();
      expect(
        root ? Object.getOwnPropertyDescriptor(root, UI_LAYOUT_NODE_PROPERTIES)?.value : undefined,
      ).toMatchObject({
        key: 'structure',
        kind: 'region',
        rendererRef: 'entry:structure',
      });
    }
  });

  it('recursively mounts the same credential Field owners in a generic Page host', () => {
    const context = tree();
    const level = {
      control: {},
      state: {},
      layout: {},
      data: { content: {}, fields: {}, resources: { runtime: {} } },
    };
    let draft: typeof level | null = level;
    const runtime = new UiSurfaceEmbeddedRuntime(
      context,
      'ctx.ui.level',
      createPopupEmbeddedRegistry(),
      {
        name: 'page-owned-credentials',
        draft: () => draft,
        componentNode: (definition) =>
          createUiSemanticLayoutNode(definition.kind, definition.id, definition.id, ''),
        node: (kind, id, selector, field) =>
          createUiSemanticLayoutNode(kind, id, id, selector, {}, field),
      },
    );
    runtime.mountRoot(
      {
        id: 'credentials',
        kind: 'auth-credentials',
        mode: 'signin',
        fieldIds: ['identity', 'password'],
      } as UiPopupCredentialsDefinition,
      level.layout,
    );
    const host = new UiSurfaceHostRuntime(context, 'ctx.ui', level);
    draft = null;
    runtime.attach();
    expect(context.get(`${host.levelPath}.layout.identity.input`)).toBeDefined();
    expect(context.get(`${host.levelPath}.layout.password.label`)).toBeDefined();
    expect(runtime.componentAt(`${host.levelPath}.layout.identity`)).toBeDefined();
    runtime.dispose();
    host.dispose();
  });

  it('keeps PopupTabs opt-in and Title/credentials independently registered', () => {
    const context = tree();
    const auth = new UiPopupRuntime(context, SIGN_IN_POPUP);
    const credentialPath = appendContextPathMember(
      `${auth.levelPath}.layout.tabs.signin.column1`,
      'signin-credentials',
    );
    expect(context.get(`${credentialPath}.identity.input`)).toBeDefined();
    expect(context.get(`${auth.levelPath}.layout.title.tools.close`)).toBeDefined();
    expect(context.get(`${auth.levelPath}.layout.content`)).toBeUndefined();
    auth.dispose();
    const single = new UiPopupRuntime(context, UNSAVED_CHANGES_POPUP);
    expect(context.get(`${single.levelPath}.layout.content.actions.discard`)).toBeDefined();
    expect(context.get(`${single.levelPath}.layout.tabs`)).toBeUndefined();
    single.dispose();
  });

  it('keeps one Field layout node and List event policy', () => {
    const context = tree();
    const entry = new UiEntryPageRuntime(
      context,
      'sys-users',
      '11111111-1111-4111-8111-111111111111',
    );
    const fieldPath = `${entry.levelPath}.layout.Entry.EntryTabs.Tab0.email`;
    expect(context.get(fieldPath)).toBeDefined();
    expect(context.get(`${fieldPath}.control`)).toBeUndefined();
    expect(context.get(`${fieldPath}.tools`)).toBeUndefined();
    expect(context.get(`${fieldPath}.label`)).toBeUndefined();
    entry.dispose();
    const list = new UiListPageRuntime(context, 'sys-users');
    list.dispatchAction('list-filter', 'toggle');
    expect(list.level.state.list.filtersVisible).toBe(true);
    list.dispatchAction('list-views', 'toggle');
    expect(list.level.state.list.viewsOpen).toBe(true);
    list.dispatchControl('list-search', 'test');
    expect(list.level.data.filters.search).toBe('test');
    list.dispose();
  });
});

describe('nested Entry presentation modes', () => {
  const guid = '11111111-1111-4111-8111-111111111111';

  it('keeps an existing Entry view-only even when the record permits updating', () => {
    const context = tree();
    const viewer = new UiEntryPageRuntime(context, 'sys-users', guid, undefined, {
      host: 'page',
      mode: 'view',
      permissions: { update: true },
    });
    expect(viewer.level.state.entry.mode).toBe('view');
    expect(viewer.level.control.invocation.params['mode']).toBe('view');
    viewer.dispose();
  });

  it('rejects create mode for an existing Entry and view mode for a new draft', () => {
    expect(
      () => new UiEntryPageRuntime(tree(), 'sys-users', guid, undefined, { mode: 'create' }),
    ).toThrow('Entry mode is incompatible');
    expect(
      () =>
        new UiEntryPageRuntime(tree(), 'sys-users', 'new', undefined, {
          host: 'popup',
          mode: 'view',
        }),
    ).toThrow('Entry mode is incompatible');
  });
});
