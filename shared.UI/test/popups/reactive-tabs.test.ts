import { describe, expect, it } from 'vitest';
import { ContextTreeRuntime, type ManatOSRuntimeRootContext } from '@manatos/shared';
import { UiPopupRuntime } from '../../src/popups/popup-runtime.js';
import type { UiPopupDefinition } from '../../src/popups/popup-definition.js';

const tree = () =>
  new ContextTreeRuntime({ ui: {} }) as unknown as ContextTreeRuntime<ManatOSRuntimeRootContext>;

const definition: UiPopupDefinition = {
  id: 'administration.storage',
  initialTab: 'configuration',
  showLanguageSelection: true,
  allowDebugger: true,
  allowFontScale: true,
  fields: [
    { id: 'adapterId', label: 'Adapter', type: 'text', autocomplete: 'off', required: false },
  ],
  rules: [],
  tabs: [
    {
      id: 'configuration',
      title: { title: 'Configuration', subtitle: '', icon: '' },
      content: [{ id: 'configuration-body', kind: 'feature-content' }],
      actions: [],
    },
    {
      id: 'files',
      title: { title: 'Files', subtitle: '', icon: '' },
      content: [{ id: 'files-body', kind: 'feature-content' }],
      actions: [],
      visibleWhen: "#data.current.adapterId == 'json'",
    },
    {
      id: 'connection',
      title: { title: 'Connection', subtitle: '', icon: '' },
      content: [{ id: 'connection-body', kind: 'feature-content' }],
      actions: [],
      visibleWhen: "#data.current.adapterId == 'sqlserver'",
      enabledWhen: "#data.current.adapterId == 'sqlserver'",
    },
  ],
};

describe('generic reactive popup tabs', () => {
  it('reconciles a hidden active tab without replacing its popup level', () => {
    const context = tree();
    const popup = new UiPopupRuntime(context, definition);
    const path = popup.levelPath;

    expect(popup.activeTab.id).toBe('configuration');
    expect(popup.tabVisible('files')).toBe(false);
    popup.setFieldValue('adapterId', 'json', true);
    expect(popup.tabVisible('files')).toBe(true);
    popup.selectTab('files');
    expect(popup.activeTab.id).toBe('files');

    popup.setFieldValue('adapterId', 'sqlserver', true);
    expect(popup.tabVisible('files')).toBe(false);
    expect(popup.tabVisible('connection')).toBe(true);
    expect(popup.activeTab.id).toBe('configuration');
    expect(popup.levelPath).toBe(path);
    popup.selectTab('files');
    expect(popup.activeTab.id).toBe('configuration');
    popup.dispose();
    expect(context.get(path)).toBeUndefined();
  });

  it('does not expose an unavailable tab through direct selection', () => {
    const popup = new UiPopupRuntime(tree(), definition);
    popup.selectTab('connection');
    expect(popup.activeTab.id).toBe('configuration');
    expect(() => popup.selectTab('nonexistent')).toThrow('Unknown popup tab');
    popup.dispose();
  });
});

describe('registered feature-content layout ownership', () => {
  it('preserves semantic children when tabs are reactively hidden or revisited', () => {
    const context = tree();
    const nested: UiPopupDefinition = {
      ...definition,
      tabs: [
        {
          ...definition.tabs![0],
          content: [
            {
              id: 'storage-configuration',
              kind: 'feature-content',
              children: [
                {
                  id: 'storage-configuration-form',
                  kind: 'feature-content',
                  children: [
                    { id: 'storage-name', kind: 'feature-content' },
                    { id: 'storage-adapter', kind: 'feature-content' },
                  ],
                },
              ],
            },
          ],
        },
        ...definition.tabs!.slice(1),
      ],
    };
    const popup = new UiPopupRuntime(context, nested);
    const path = popup.levelPath;

    const before = JSON.stringify(popup.level.layout);
    expect(before).toContain('storage-configuration-form');
    expect(before).toContain('storage-name');
    expect(before).toContain('storage-adapter');

    popup.setFieldValue('adapterId', 'json', true);
    popup.selectTab('files');
    popup.setFieldValue('adapterId', 'sqlserver', true);
    expect(popup.activeTab.id).toBe('configuration');
    popup.reconcileTabLayout('configuration');
    expect(JSON.stringify(popup.level.layout)).toContain('storage-name');
    expect(popup.levelPath).toBe(path);

    popup.dispose();
    expect(context.get(path)).toBeUndefined();
  });
});

describe('completed reactive popup contracts', () => {
  it('tracks requiredness and invalidates downstream evidence only on changed inputs', () => {
    const context = tree();
    const reactive: UiPopupDefinition = {
      ...definition,
      tabs: definition.tabs!.map((tab) =>
        tab.id === 'files'
          ? {
              ...tab,
              requiredWhen: "#data.current.adapterId == 'json'",
              invalidateOn: ['adapterId'],
            }
          : tab,
      ),
    };
    const popup = new UiPopupRuntime(context, reactive);
    expect(popup.tabRequired('files')).toBe(false);
    expect(popup.tabInvalidated('files')).toBe(false);

    popup.setFieldValue('adapterId', 'json', true);
    expect(popup.tabRequired('files')).toBe(true);
    expect(popup.tabInvalidated('files')).toBe(true);

    popup.acknowledgeTab('files');
    popup.setFieldValue('adapterId', 'json', true);
    expect(popup.tabInvalidated('files')).toBe(false);

    popup.setFieldValue('adapterId', 'sqlserver', true);
    expect(popup.tabRequired('files')).toBe(false);
    expect(popup.tabInvalidated('files')).toBe(true);
    popup.dispose();
  });

  it('replaces only the active adapter variant under its semantic owner', () => {
    const context = tree();
    const variantDefinition: UiPopupDefinition = {
      ...definition,
      tabs: [
        {
          ...definition.tabs![0],
          content: [
            {
              id: 'variant-body',
              kind: 'feature-content',
              children: [
                {
                  id: 'variant-fields',
                  kind: 'feature-content',
                  variantField: 'adapterId',
                  variants: {
                    json: [{ id: 'json-file-path', kind: 'feature-content' }],
                    sqlserver: [{ id: 'sql-server-name', kind: 'feature-content' }],
                  },
                },
              ],
            },
          ],
        },
        ...definition.tabs!.slice(1),
      ],
    };
    const popup = new UiPopupRuntime(context, variantDefinition);
    const path = popup.levelPath;
    expect(JSON.stringify(popup.level.layout)).not.toContain('json-file-path');

    popup.setFieldValue('adapterId', 'json', true);
    expect(JSON.stringify(popup.level.layout)).toContain('json-file-path');
    expect(JSON.stringify(popup.level.layout)).not.toContain('sql-server-name');

    popup.setFieldValue('adapterId', 'sqlserver', true);
    expect(JSON.stringify(popup.level.layout)).not.toContain('json-file-path');
    expect(JSON.stringify(popup.level.layout)).toContain('sql-server-name');
    expect(Object.keys(popup.level.state.embeddedErrors)).toHaveLength(0);
    popup.dispose();
    expect(context.get(path)).toBeUndefined();
  });

  it('preserves existing Auth popup static tab and secret-safe lifecycle', async () => {
    const { getAuthPopupDefinition } = await import('../../src/popups/auth/definitions.js');
    const context = tree();
    const popup = new UiPopupRuntime(context, getAuthPopupDefinition('auth.register'));
    const path = popup.levelPath;
    expect(popup.views.length).toBeGreaterThan(1);
    for (const tab of popup.views) {
      expect(popup.tabVisible(tab.id)).toBe(true);
      expect(popup.tabEnabled(tab.id)).toBe(true);
      expect(popup.tabRequired(tab.id)).toBe(false);
    }
    expect(Object.keys(popup.level.state.invalidatedTabs)).toHaveLength(0);
    popup.selectTab(popup.views[1]!.id);
    expect(popup.activeTab.id).toBe(popup.views[1]!.id);
    popup.dispose();
    expect(context.get(path)).toBeUndefined();
  });
});

describe('shared popup-wide action ownership', () => {
  it('mounts one root footer while retaining reactive Storage tabs', () => {
    const context = tree();
    const storage: UiPopupDefinition = {
      ...definition,
      actions: [
        { id: 'cancel', label: 'Close', type: 'button' },
        {
          id: 'save',
          label: 'Save',
          type: 'submit',
          enabledWhen: '#data.fields.adapterId.valid',
        },
      ],
    };
    const popup = new UiPopupRuntime(context, storage);
    const path = popup.levelPath;

    expect(popup.level.layout.actions).toBeDefined();
    expect(
      (popup.level.layout.actions as unknown as Record<string, unknown>)?.['save'],
    ).toBeDefined();
    for (const tab of Object.values(popup.level.layout.tabs ?? {})) {
      expect((tab as unknown as Record<string, unknown>)['actions']).toBeUndefined();
    }

    const actions: string[] = [];
    popup.onAction((request) => actions.push(request.actionId));
    popup.setFieldValue('adapterId', 'json', true);
    popup.selectTab('files');
    popup.requestAction('save');
    expect(actions).toEqual(['save']);
    popup.dispose();
    expect(context.get(path)).toBeUndefined();
  });

  it('preserves the original tab-scoped actions for Auth-style definitions', () => {
    const staticTabs: UiPopupDefinition = {
      ...definition,
      tabs: definition.tabs!.map((tab) => ({
        ...tab,
        actions: [{ id: 'cancel', label: 'Cancel', type: 'button' }],
      })),
    };
    const popup = new UiPopupRuntime(tree(), staticTabs);
    expect(popup.level.layout.actions).toBeUndefined();
    for (const tab of Object.values(popup.level.layout.tabs ?? {})) {
      expect((tab as unknown as Record<string, unknown>)['actions']).toBeDefined();
    }
    popup.dispose();
  });
});
