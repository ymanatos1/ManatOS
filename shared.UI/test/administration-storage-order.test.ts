import { describe, expect, it, vi } from 'vitest';

import { UiBrowserAdministrationClient } from '../src/browser/administration-client.js';

describe('Storage configuration drag-and-drop persistence', () => {
  it('sends the full ordered ID set through the authenticated bulk-order route', async () => {
    const client = new UiBrowserAdministrationClient();
    const request = vi.fn().mockResolvedValue({});
    Object.assign(client, { request });
    const ids = ['second', 'first', 'third'];

    await client.reorderStorageConfigurations(ids);

    expect(request).toHaveBeenCalledWith(
      '/storage/configurations/order',
      'PATCH',
      { ids },
      undefined,
    );
    expect(ids).toEqual(['second', 'first', 'third']);
  });
});
