export interface LanguageDefinition {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly nativeName: string;
  readonly flag: string;
}

export interface LanguageCatalogue {
  readonly defaultLanguage: string;
  readonly languages: readonly LanguageDefinition[];
}

export const DEFAULT_LANGUAGE_ID = 'en';

// Canonical ManatOS UI language catalogue shared by the runtime and all UI clients.
// Translation completeness is a separate concern from language availability.
export const SUPPORTED_LANGUAGES: readonly LanguageDefinition[] = Object.freeze([
  Object.freeze({
    id: 'en',
    code: 'EN',
    name: 'English',
    nativeName: 'English',
    flag: 'en',
  }),
  Object.freeze({
    id: 'el',
    code: 'EL',
    name: 'Greek',
    nativeName: 'Ελληνικά',
    flag: 'el',
  }),
]);

export const SUPPORTED_LANGUAGE_CATALOGUE: LanguageCatalogue = Object.freeze({
  defaultLanguage: DEFAULT_LANGUAGE_ID,
  languages: SUPPORTED_LANGUAGES,
});
