import { describe, expect, it } from 'vitest';

import {
  persistedCollectionPictureSource,
  persistedScalarPictureSource,
} from '@manatos/shared/presentation/picture-value';

describe('canonical picture value sources', () => {
  it('resolves persisted scalar pictures and never assigns a persisted source to pending values', () => {
    expect(
      persistedScalarPictureSource('sys-users', 'user 1', 'photo', {
        revision: 'r/1',
        pending: false,
      }),
    ).toBe('/bo/sys-users/user%201/picture/photo?revision=r%2F1');
    expect(
      persistedScalarPictureSource('sys-users', 'user-1', 'photo', {
        revision: 'pending:1',
        pending: true,
      }),
    ).toBeNull();
  });

  it('resolves persisted collection pictures only when the picture has its canonical item identity', () => {
    expect(
      persistedCollectionPictureSource('sample', 'record-1', 'gallery', {
        id: 'picture/1',
        revision: 'r2',
        pending: false,
      }),
    ).toBe('/bo/sample/record-1/pictures/gallery/picture%2F1?revision=r2');
    expect(
      persistedCollectionPictureSource('sample', 'record-1', 'gallery', {
        revision: 'r2',
        pending: false,
      }),
    ).toBeNull();
  });
});
