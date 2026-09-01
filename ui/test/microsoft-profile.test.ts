import { describe, expect, it } from 'vitest';

import { normalizeMicrosoftProfile } from '../src/auth/providers/microsoft-provider.js';

describe('Microsoft external profile normalization', () => {
  it('normalizes a Microsoft Graph profile into the common external profile', () => {
    expect(
      normalizeMicrosoftProfile({
        id: 'microsoft-user-id',
        displayName: 'Yiannis Manatos',
        name: {
          givenName: 'Yiannis',
          familyName: 'Manatos',
        },
        emails: [{ value: 'yiannis@manatos.eu' }],
      }),
    ).toEqual({
      provider: 'microsoft',
      providerSubject: 'microsoft-user-id',
      email: 'yiannis@manatos.eu',
      emailVerified: false,
      displayName: 'Yiannis Manatos',
      firstName: 'Yiannis',
      lastName: 'Manatos',
    });
  });

  it('falls back to userPrincipalName when Graph does not expose mail/email', () => {
    expect(
      normalizeMicrosoftProfile({
        id: 'microsoft-user-id',
        _json: {
          userPrincipalName: 'yiannis@manatos.eu',
        },
      }).email,
    ).toBe('yiannis@manatos.eu');
  });

  it('rejects a Microsoft profile that cannot supply an email address', () => {
    expect(() =>
      normalizeMicrosoftProfile({ id: 'microsoft-user-id' }),
    ).toThrow('Microsoft did not supply an email address.');
  });
});
