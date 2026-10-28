import { describe, expect, it, vi } from 'vitest';
import type { UiStorageConfiguration } from '@manatos/shared-ui';
import { StoragePageHost } from '../src/components/administration/StoragePageHost';

const item = { id: 'candidate', name: 'Development database' } as UiStorageConfiguration;

function setup() {
  let open = false;
  let readOnly = false;
  let busy = false;
  let selected = 'live';
  let disposed = false;
  let listener: ((event: string) => void) | undefined;
  const deleteStorageConfiguration = vi.fn((id: string) => {
    void id;
    return Promise.resolve();
  });
  const popup = {
    isOpen: () => open,
    close: () => {
      if (!open) return;
      open = false;
      listener?.('disposing');
    },
    onEvent: (callback: (event: string) => void) => {
      listener = callback;
      return () => {
        if (listener === callback) listener = undefined;
      };
    },
  };
  const surfaceOpen = vi.fn((name: string, options: unknown) => {
    void name;
    void options;
    open = true;
    return popup;
  });
  const host = Object.assign(Object.create(StoragePageHost.prototype), {
    disposed: false,
    readOnly: () => readOnly,
    busy: () => busy,
    snapshot: () => ({
      configurations: [item],
      selectedConfigurationId: selected,
      runningConfigurationId: 'live',
    }),
    surfaces: { open: surfaceOpen },
    api: { deleteStorageConfiguration },
    controller: new AbortController(),
    t: (en: string) => en,
    execute: async (operation: () => Promise<void>) => operation(),
  }) as StoragePageHost;
  const remove = () =>
    (host as unknown as { remove: (configuration: UiStorageConfiguration) => void }).remove(item);
  const emit = (event: string) => listener?.(event);
  return {
    host,
    remove,
    emit,
    surfaceOpen,
    deleteStorageConfiguration,
    setSelected: (value: string) => (selected = value),
    setReadOnly: (value: boolean) => (readOnly = value),
    setBusy: (value: boolean) => (busy = value),
    dispose: () => {
      disposed = true;
      Object.assign(host, { disposed });
      popup.close();
    },
  };
}

describe('Storage deletion confirmation', () => {
  it('opens the existing UIS AlertPopup, never deleting until the affirmative event', () => {
    const subject = setup();
    subject.remove();
    expect(subject.surfaceOpen).toHaveBeenCalledOnce();
    const [name, options] = subject.surfaceOpen.mock.calls[0]!;
    expect(name).toBe('message.alert');
    expect(options).toMatchObject({
      params: {
        buttons: [
          { id: 'dismiss', label: { EN: 'Cancel', EL: 'Άκυρον' } },
          { id: 'delete', tone: 'danger' },
        ],
      },
      events: { delete: 'storage-delete-confirmed' },
      allowBackdropClosure: false,
    });
    subject.remove(); // A second click cannot stack confirmations.
    expect(subject.surfaceOpen).toHaveBeenCalledOnce();
    expect(subject.deleteStorageConfiguration).not.toHaveBeenCalled();
    subject.emit('storage-delete-confirmed');
    expect(subject.deleteStorageConfiguration).toHaveBeenCalledTimes(1);
    expect(subject.deleteStorageConfiguration).toHaveBeenCalledWith(
      'candidate',
      expect.any(AbortSignal),
    );
  });

  it('does not delete on dismissal or if the target becomes selected', () => {
    const cancelled = setup();
    cancelled.remove();
    cancelled.emit('disposing');
    expect(cancelled.deleteStorageConfiguration).not.toHaveBeenCalled();

    const protectedTarget = setup();
    protectedTarget.remove();
    protectedTarget.setSelected('candidate');
    protectedTarget.emit('storage-delete-confirmed');
    expect(protectedTarget.deleteStorageConfiguration).not.toHaveBeenCalled();
  });

  it('enforces permissions, busy state and page disposal at the confirmation boundary', () => {
    const subject = setup();
    subject.setReadOnly(true);
    subject.remove();
    expect(subject.surfaceOpen).not.toHaveBeenCalled();
    subject.setReadOnly(false);
    subject.remove();
    subject.setBusy(true);
    subject.emit('storage-delete-confirmed');
    expect(subject.deleteStorageConfiguration).not.toHaveBeenCalled();

    subject.setBusy(false);
    subject.remove();
    subject.dispose();
    subject.emit('storage-delete-confirmed');
    expect(subject.deleteStorageConfiguration).not.toHaveBeenCalled();
  });
});
