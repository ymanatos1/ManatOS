import type { ExternalProfile } from './external-profile.js';

/**
 * Minimal Microsoft Graph profile shape used by the Passport adapter.
 *
 * Microsoft Graph's `mail` can be empty, so `userPrincipalName` is retained as
 * a fallback. Neither value is treated as independently verified by ManatOS.
 */
export interface MicrosoftGraphProfile {
  id: string;
  displayName?: string;
  name?: {
    givenName?: string;
    familyName?: string;
  };
  emails?: Array<{ value?: string }>;
  _json?: {
    mail?: string | null;
    userPrincipalName?: string | null;
    givenName?: string | null;
    surname?: string | null;
  };
}

export function normalizeMicrosoftProfile(profile: MicrosoftGraphProfile): ExternalProfile {
  const email =
    profile.emails?.find((entry) => entry.value?.trim())?.value?.trim() ||
    profile._json?.mail?.trim() ||
    profile._json?.userPrincipalName?.trim();

  if (!email) {
    throw new Error('Microsoft did not supply an email address.');
  }

  const firstName = profile.name?.givenName?.trim() || profile._json?.givenName?.trim();
  const lastName = profile.name?.familyName?.trim() || profile._json?.surname?.trim();

  return {
    provider: 'microsoft',
    providerSubject: profile.id,
    email,

    // Graph mail/UPN presence is not, by itself, ManatOS proof that the email
    // address is verified. Keep this conservative unless Microsoft OIDC token
    // claims provide an explicit verification guarantee we decide to trust.
    emailVerified: false,

    ...(profile.displayName?.trim() ? { displayName: profile.displayName.trim() } : {}),
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
  };
}
