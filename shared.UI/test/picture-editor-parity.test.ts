import { describe, expect, it } from 'vitest';
import {
  assertPictureSource,
  pendingPictureDescriptor,
  pictureEditorPolicy,
  PicturePendingResources,
} from '../src/components/picture/PictureEditor.js';
import {
  deriveEntryFieldState,
  entryAvailableOptions,
} from '../src/components/entry/EntryEditState.js';

describe('EJS0 picture metadata migrated to the reusable UIS editor', () => {
  it('uses canonical per-entity metadata rather than hard-coded component policy', () => {
    const user = pictureEditorPolicy('sys-users', 'photo');
    const principal = pictureEditorPolicy('sys-principals', 'photo');
    const collection = pictureEditorPolicy('sys-applications', 'pictures');
    expect(user.outputSize).toBe(768);
    expect(principal.outputSize).toBe(768);
    expect(collection.outputSize).toBe(1024);
    expect(user.cropModes).toContain('proportional');
    expect(user.cropModes).toContain('free');
    expect(user.maxSourceBytes).toBe(20_000_000);
  });

  it('accepts the four supported source formats and rejects oversized or unsafe files', () => {
    const policy = pictureEditorPolicy('sys-users', 'photo');
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
      expect(() => assertPictureSource({ type, size: 100 }, policy)).not.toThrow();
    }
    expect(() => assertPictureSource({ type: 'image/svg+xml', size: 100 }, policy)).toThrow();
    expect(() => assertPictureSource({ type: 'image/png', size: 0 }, policy)).toThrow();
    expect(() => assertPictureSource({ type: 'image/png', size: 20_000_001 }, policy)).toThrow();
  });

  it('publishes only a descriptor to CTX; private pending bytes stay in the Entry ledger', () => {
    const bytes = { contentType: 'image/jpeg', dataBase64: 'AQID', size: 3 };
    const descriptor = pendingPictureDescriptor(bytes, 'pending:abc-123');
    expect(descriptor).toMatchObject({ pending: true, id: 'pending:abc-123' });
    expect(JSON.stringify(descriptor)).not.toContain('AQID');
    const ledger = new PicturePendingResources();
    ledger.add(descriptor, bytes);
    expect(ledger.get(descriptor.id)).toEqual(bytes);
    ledger.remove(descriptor.id);
    expect(ledger.get(descriptor.id)).toBeUndefined();
    ledger.add(descriptor, bytes);
    ledger.clear();
    expect(ledger.get(descriptor.id)).toBeUndefined();
  });
});

describe('EJS0 enum-option policy parity', () => {
  const permissions = { read: true, update: true };
  const options = entryAvailableOptions('sys-principals', 'EN');

  it('enables editable Parent principal for Person without enabling calculated Root principal', () => {
    const state = deriveEntryFieldState(
      'sys-principals',
      { principalType: 'Person' },
      { principalType: 'Person' },
      'edit',
      permissions,
      options,
    );
    expect(state.fields['parentId']?.editable).toBe(true);
    expect(state.fields['rootId']?.editable).toBe(false);
  });

  it('preserves metadata restrictions for Company and all fields in View mode', () => {
    const company = deriveEntryFieldState(
      'sys-principals',
      { principalType: 'Company' },
      { principalType: 'Company' },
      'edit',
      permissions,
      options,
    );
    expect(company.fields['parentId']?.editable).toBe(false);
    const viewer = deriveEntryFieldState(
      'sys-principals',
      { principalType: 'Person' },
      { principalType: 'Person' },
      'view',
      permissions,
      options,
    );
    expect(viewer.fields['parentId']?.editable).toBe(false);
  });
});
