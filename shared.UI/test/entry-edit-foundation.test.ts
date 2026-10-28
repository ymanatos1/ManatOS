import { describe, expect, it } from 'vitest';
import {
  deriveEntryFieldState,
  entryAvailableOptions,
  entryEvaluationScope,
  resolveEntryOptions,
  uiEntryCaption,
  uiEntryFieldPresentation,
  uiEntryFieldTools,
  uiEntryTabs,
} from '../src/index.js';

describe('Entry editing foundation', () => {
  const original = {
    id: '1',
    name: 'yiannis',
    firstName: 'Yiannis',
    lastName: 'Manatos',
    email: 'yiannis@example.com',
    enabled: true,
    role: 'User',
  };
  const options = entryAvailableOptions('sys-users', 'EN');

  it('uses contextual grammatical forms without changing the canonical singular label', () => {
    expect(uiEntryCaption('sys-users', { ...original, fullName: 'Yiannis Manatos' }, 'EL')).toBe(
      'Επεξεργασία Χρήστη - Yiannis Manatos',
    );
    expect(uiEntryCaption('sys-users', { ...original, fullName: 'Yiannis Manatos' }, 'EN')).toBe(
      'Edit User - Yiannis Manatos',
    );
  });

  it('uses the same option resolution for canonical and inline options, retaining icons', () => {
    const enumOptions = resolveEntryOptions({ type: 'enum', enum: 'SysBOUserRole' }, 'EL');
    expect(enumOptions).toHaveLength(4);
    expect(enumOptions.find((item) => item.value === 'Admin')).toMatchObject({
      label: 'Διαχειριστής',
      icon: 'shield-lock-fill',
    });
    const inlineOptions = resolveEntryOptions(
      {
        type: 'enum',
        enumItems: [
          { value: 'one', label: { EN: 'One', EL: 'Ένα' }, icon: 'star' },
          { value: 'two', label: 'Two' },
        ],
      },
      'EL',
    );
    expect(inlineOptions).toEqual([
      { value: 'one', label: 'Ένα', icon: 'star' },
      { value: 'two', label: 'Two' },
    ]);
    expect(resolveEntryOptions({ type: 'enum', enum: 'MissingEnum' }, 'EN')).toEqual([]);
  });

  it('keeps current/original as sole values, with derived dirty and validation state', () => {
    const initial = deriveEntryFieldState(
      'sys-users',
      original,
      original,
      'edit',
      { update: true },
      options,
    );
    expect(initial.fields.email?.dirty).toBe(false);
    expect(initial.aggregate.dirty).toBe(false);

    const changed = { ...original, email: '' };
    const next = deriveEntryFieldState(
      'sys-users',
      original,
      changed,
      'edit',
      { update: true },
      options,
    );
    expect(next.fields.email).toMatchObject({
      visible: true,
      editable: true,
      dirty: true,
      valid: false,
    });
    expect(next.aggregate).toMatchObject({ dirty: true, valid: false, saveReady: false });
    expect(entryEvaluationScope(changed, 'edit', {}).fields).toHaveProperty('email');
  });

  it('does not grant editing based on UI presentation alone', () => {
    const denied = deriveEntryFieldState(
      'sys-users',
      original,
      original,
      'edit',
      { update: false },
      options,
    );
    expect(denied.fields.email?.editable).toBe(false);
    const viewer = deriveEntryFieldState(
      'sys-users',
      original,
      original,
      'view',
      { update: true },
      options,
    );
    expect(viewer.fields.email?.editable).toBe(false);
    expect(viewer.fields.fullName?.editable).toBe(false);
  });

  it('presents enum option labels and enables only actual field tools', () => {
    const state = deriveEntryFieldState(
      'sys-users',
      original,
      { ...original, name: '  yiannis  ' },
      'edit',
      { update: true },
      options,
    );
    const field = uiEntryFieldPresentation(
      'sys-users',
      'name',
      '  yiannis  ',
      'EN',
      undefined,
      undefined,
      undefined,
      state.fields.name,
    );
    expect(field).not.toBeNull();
    expect(field?.dirty).toBe(true);
    const tools = uiEntryFieldTools(field!);
    expect(tools.find((tool) => tool.id === 'revert')?.enabled).toBe(true);
    expect(tools.find((tool) => tool.id === 'trim')?.enabled).toBe(true);
    expect(tools.some((tool) => tool.id === 'inspect-ctx')).toBe(false);
  });

  it('localizes actual Field Tools without changing their action identities or permission semantics', () => {
    const state = deriveEntryFieldState(
      'sys-users',
      original,
      original,
      'edit',
      { update: true },
      options,
    );
    const en = uiEntryFieldPresentation(
      'sys-users',
      'name',
      original.name,
      'EN',
      undefined,
      undefined,
      undefined,
      state.fields.name,
    );
    const el = uiEntryFieldPresentation(
      'sys-users',
      'name',
      original.name,
      'EL',
      undefined,
      undefined,
      undefined,
      state.fields.name,
    );
    expect(en).not.toBeNull();
    expect(el).not.toBeNull();
    const enTools = uiEntryFieldTools(en!, { inspectCtx: true });
    const elTools = uiEntryFieldTools(el!, { inspectCtx: true });
    expect(elTools.map((tool) => [tool.id, tool.enabled])).toEqual(
      enTools.map((tool) => [tool.id, tool.enabled]),
    );
    expect(elTools.find((tool) => tool.id === 'copy')?.label).toBe('Αντιγραφή τρέχουσας τιμής');
    expect(elTools.find((tool) => tool.id === 'inspect-ctx')?.label).toBe(
      'Επιθεώρηση στο CTX Viewer',
    );
    expect(elTools.every((tool) => !tool.label.startsWith('@CM.'))).toBe(true);
  });

  it('preserves the Authentication tab only under its metadata permission rule', () => {
    expect(
      uiEntryTabs('sys-users', 'EN', {
        mode: 'edit',
        permissions: { update: true },
        record: original,
      }).some((tab) => tab.id === 'authentication'),
    ).toBe(true);
    expect(
      uiEntryTabs('sys-users', 'EN', {
        mode: 'edit',
        permissions: { update: false },
        record: original,
      }).some((tab) => tab.id === 'authentication'),
    ).toBe(false);
  });
});
