import { describe, expect, it } from 'vitest';
import * as shared from '../src/index.js';

describe('@manatos/shared', () => {
  it('exposes the shared package public API', () => {
    expect(shared).toBeDefined();
    expect(typeof shared).toBe('object');
  });

  it('owns the canonical UI language catalogue independently of the API', () => {
    expect(shared.DEFAULT_LANGUAGE_ID).toBe('en');
    expect(shared.SUPPORTED_LANGUAGES).toEqual([
      { id: 'en', code: 'EN', name: 'English', nativeName: 'English', flag: 'en' },
      { id: 'el', code: 'EL', name: 'Greek', nativeName: 'Ελληνικά', flag: 'el' },
    ]);
    expect(shared.SUPPORTED_LANGUAGE_CATALOGUE).toEqual({
      defaultLanguage: 'en',
      languages: shared.SUPPORTED_LANGUAGES,
    });
  });
});
