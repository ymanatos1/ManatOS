// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { UiBrowserAdministrationClient, type UiStorageSnapshot } from '@manatos/shared-ui';
import { mountStoragePageHost } from '../src/components/administration/StoragePageHost.js';
import type { EjsUiSurfaceManager } from '../src/components/surfaces/EjsUiSurfaceManager.js';

const adapter = {
  id: 'json',
  name: 'JSON',
  description: '',
  familyPath: ['Document'],
  logoUrl: '/images/storage-adapters/json.svg',
  runtimeAvailable: true,
  tabs: [],
  capabilities: [],
};
const configurations = [
  {
    id: 'a',
    name: 'First',
    adapterId: 'json',
    sequence: 0,
    stage: 'complete',
    status: 'ready',
    settings: {},
    configuredSecretKeys: [],
  },
  {
    id: 'b',
    name: 'Second',
    adapterId: 'json',
    sequence: 1,
    stage: 'complete',
    status: 'ready',
    settings: {},
    configuredSecretKeys: [],
  },
];

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('EJS1 Storage ordering and picker parity', () => {
  it('reorders using the complete API order, reloads server order, and cancels without saving', async () => {
    let ordered = configurations;
    const storage = vi.spyOn(UiBrowserAdministrationClient.prototype, 'storage').mockImplementation(
      async () =>
        ({
          adapters: [adapter],
          configurations: ordered,
          selectedConfigurationId: 'a',
          runningConfigurationId: 'a',
          currentConfigurationId: 'a',
          debugging: { apiStorageContextEnabled: false, outputDirectory: '../data/logs/api/' },
        }) as UiStorageSnapshot,
    );
    const reorder = vi
      .spyOn(UiBrowserAdministrationClient.prototype, 'reorderStorageConfigurations')
      .mockImplementation(async (ids) => {
        ordered = ids.map((id, index) => ({
          ...configurations.find((item) => item.id === id)!,
          sequence: index,
        }));
      });

    document.body.innerHTML =
      '<section data-administration-storage><div data-administration-storage-content></div></section>';
    const page = mountStoragePageHost(document, () => 'EN', false, {} as EjsUiSurfaceManager);
    try {
      await vi.waitFor(() =>
        expect(document.querySelectorAll('[data-storage-configuration-id]')).toHaveLength(2),
      );
      expect(document.querySelector('[data-storage-next-picker] img')?.getAttribute('src')).toBe(
        '/images/storage-adapters/json.svg',
      );
      const body = document.querySelector('[data-storage-configurations]')!;
      const rows = Array.from(body.querySelectorAll('tr'));
      const drag = new Event('dragstart', { bubbles: true });
      Object.defineProperty(drag, 'dataTransfer', {
        value: { setData: vi.fn(), effectAllowed: '' },
      });
      rows[1]!.dispatchEvent(drag);
      body.insertBefore(rows[1]!, rows[0]!);
      rows[0]!.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
      await vi.waitFor(() =>
        expect(reorder).toHaveBeenCalledWith(['b', 'a'], expect.any(AbortSignal)),
      );
      await vi.waitFor(() =>
        expect(
          document
            .querySelector('[data-storage-configuration-id]')
            ?.getAttribute('data-storage-configuration-id'),
        ).toBe('b'),
      );
      const first = document.querySelector('[data-storage-configuration-id]')!;
      first.dispatchEvent(drag);
      first.dispatchEvent(new Event('dragend', { bubbles: true }));
      expect(reorder).toHaveBeenCalledTimes(1);
      expect(storage).toHaveBeenCalled();
    } finally {
      page.destroy();
    }
  });
});
