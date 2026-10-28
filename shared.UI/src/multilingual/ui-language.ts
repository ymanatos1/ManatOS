import {
  resolveMetadataText,
  type MetadataLanguage,
  type MultilingualLiteral,
  SUPPORTED_LANGUAGE_CATALOGUE,
  type LanguageCatalogue,
  type LanguageDefinition,
} from '@manatos/shared';

export type UiLanguageDefinition = LanguageDefinition;
export type UiLanguageCatalogue = LanguageCatalogue;

export const UI_LANGUAGE_CATALOGUE: UiLanguageCatalogue = SUPPORTED_LANGUAGE_CATALOGUE;

export function resolveUiLanguage(
  catalogue: UiLanguageCatalogue,
  languageId: string,
): UiLanguageDefinition {
  return (
    catalogue.languages.find((language) => language.id === languageId) ??
    catalogue.languages.find((language) => language.id === catalogue.defaultLanguage) ??
    catalogue.languages[0]!
  );
}

/** Only status messages emitted by ManatOS itself are looked up by English text.
 * Unknown service or user messages remain untouched.
 */
const UI_STATUS_KEYS: Readonly<Record<string, string>> = {
  'Signing out…': '@CM.SigningOut',
  'The UI session service is unavailable. Reconnecting…': '@CM.UiSessionUnavailable',
  'The API authentication service is unavailable. Reconnecting…':
    '@CM.ApiAuthenticationUnavailable',
  'Session verification is temporarily unavailable. Reconnecting…':
    '@CM.SessionVerificationUnavailable',
  'Session verification failed unexpectedly. Retry to continue.': '@CM.SessionVerificationFailed',
  'Platform permissions are temporarily unavailable.': '@CM.PlatformPermissionsUnavailable',
  'Your session has expired. Please sign in again.': '@CM.SessionExpired',
  'Sign Out could not be confirmed. The local session is blocked; retry to finish signing out.':
    '@CM.SignOutNotConfirmed',
  'Checking connectivity…': '@CM.CheckingConnectivity',
  'ManatOS is still unavailable.': '@CM.ManatOsStillUnavailable',
  'Connected. Closing the previous session…': '@CM.ClosingPreviousSession',
  'Could not close the previous session. Retry when connected.': '@CM.PreviousSessionNotClosed',
};

export interface UiMultilingualMethods {
  readonly resolve: (value: string | MultilingualLiteral) => string;
  readonly select: (
    condition: boolean,
    whenTrue: string | MultilingualLiteral,
    whenFalse: string | MultilingualLiteral,
  ) => string;
  readonly status: (message: string) => string;
  readonly format: (
    value: string | MultilingualLiteral,
    parameters: Readonly<Record<string, string | number>>,
  ) => string;
}

export function multilingual<const K extends string>(
  language: MetadataLanguage,
  keys: readonly K[],
  variables?: Readonly<Record<string, string | number>>,
): Readonly<Record<K, string>> & UiMultilingualMethods;
export function multilingual<
  const T extends Readonly<Record<string, string | MultilingualLiteral>>,
>(
  language: MetadataLanguage,
  labels: T,
  variables?: Readonly<Record<string, string | number>>,
): Readonly<{ [K in keyof T]: string }> & UiMultilingualMethods;
export function multilingual(
  language: MetadataLanguage,
  keysOrLabels: readonly string[] | Readonly<Record<string, string | MultilingualLiteral>>,
  variables: Readonly<Record<string, string | number>> = {},
): Readonly<Record<string, string>> & UiMultilingualMethods {
  const resolve = (value: string | MultilingualLiteral): string =>
    resolveMetadataText(value, language);
  const select = (
    condition: boolean,
    whenTrue: string | MultilingualLiteral,
    whenFalse: string | MultilingualLiteral,
  ): string => resolve(condition ? whenTrue : whenFalse);
  const format = (
    value: string | MultilingualLiteral,
    parameters: Readonly<Record<string, string | number>>,
  ): string =>
    resolve(value).replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (match, key: string) =>
      Object.prototype.hasOwnProperty.call(parameters, key) ? String(parameters[key]) : match,
    );
  const labels: Readonly<Record<string, string | MultilingualLiteral>> = Array.isArray(keysOrLabels)
    ? Object.fromEntries(keysOrLabels.map((key) => [key, `@CM.${key}`]))
    : (keysOrLabels as Readonly<Record<string, string | MultilingualLiteral>>);
  const status = (message: string): string => resolve(UI_STATUS_KEYS[message] ?? message);
  return Object.assign(
    Object.fromEntries(
      Object.entries(labels).map(([key, value]) => [key, format(value, variables)]),
    ),
    { resolve, select, format, status },
  );
}
