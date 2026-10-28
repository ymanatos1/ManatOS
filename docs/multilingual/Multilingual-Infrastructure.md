# Multilingual Infrastructure: Architecture and Responsibilities

Multilingual presentation is a projection of a stable application model into a reader's chosen language. A language change is principally a **presentation event**, not a domain mutation. That distinction avoids duplicating the user's record values, relationship identities or permissions for each language.

## Semantic ownership and presentation ownership

Canonical entity metadata, subsystem descriptions and platform definitions may contain symbolic text references such as `@PL.Panoptes.Name`. Shared dictionaries define the translations. The runtime must resolve those references where human-facing strings are required; it should not overwrite the underlying metadata with one language's result and then treat that value as canonical.

The principal boundaries are:

| Concern | Authority | Consequence |
|---|---|---|
| Entity keys, field names, enum identities, record IDs | Canonical metadata and domain model | Never translate keys or persisted identities |
| Locale and language selection | UI preference/presentation host | May change independently of business data |
| Catalogue text | Shared dictionaries | Reusable across API metadata and client technologies |
| Component messages and UI labels | UIS presentation layer | Render against the current language |
| Static HTML content | Static content translation boundary | Process as content; do not pretend it is a metadata-key dictionary |
| API errors and authorization | API and trusted server | Error codes and decisions are stable; public human-readable messages may be localized at presentation |

A label changing from English to Greek must not produce a dirty Entry, alter a calculation or trigger a persistence operation.

## Catalogue architecture

`shared/src/multilingual/languages.ts` declares the supported language IDs and the default. `shared/src/multilingual/metadata/` owns five dictionaries: `CO`, `PL`, `SS`, `EN`, and `CM`. The group prefix is part of the addressing contract. It describes the text's domain, not its visual placement; a reusable component should not create a second competing translation namespace solely because it is rendered in an Angular or EJS adapter.

`resolveMetadataText` accepts a symbolic string or an inline multilingual literal. `localizeMetadataPresentation` recursively projects text-bearing presentation metadata without changing the canonical business definition. `shared.UI/src/multilingual/ui-language.ts` supplies component-facing `multilingual(...)` methods including `resolve`, conditional `select`, parameter `format` and known-status `status` resolution.

## Integration with clients

The Angular adapter can react to language selection and reproject visible UI. The EJS adapter resolves text as it renders and must explicitly refresh any presentation that remains mounted while the language changes. The EJS0 reference UI has a separate per-request rendering path. These mechanisms are not interchangeable: **common semantics, technology-specific re-rendering** is the cross-client contract.

Changing a language should update text, tooltips and accessibility labels belonging to the presentation, without remounting canonical domain state unnecessarily. Any component caching translated strings must invalidate that view cache on language change. This is particularly relevant to detached documentation/popup windows and debugger surfaces; they require a defined language input and update mechanism.

## Architectural invariants

1. Preserve the distinction between language identifiers (`en`, `el`), dictionary groups (`CO`, `PL`, `SS`, `EN`, `CM`) and domain enum identifiers.
2. Keep symbolic references or multilingual literals in source metadata; resolve at a presentation boundary.
3. Translate complete messages, not arbitrary concatenated fragments assembled around variables.
4. Escape resolved text for its output context. A translated string is **not** trusted HTML.
5. Localize user-facing descriptions; never localize identifiers, expression syntax, API path fragments or persisted foreign keys.
6. Treat fallback behavior and untranslated keys as correctness matters; language availability alone does not establish translation completeness.

## Extension and review

New text first needs a semantic owner and an appropriate dictionary group. Add both language values when possible, select keys stable across refactoring and use parameter placeholders for dynamic data. The emitting component must respond correctly to language changes and must not leak translated content into CTX business values.

A multilingual test should cover the default language, an alternate language, missing text, parameter formatting, live language switches and output escaping. Presentation consistency across NG1 and EJS1 must be established at their respective adapter boundaries rather than assumed from use of a shared dictionary.

See [Translation and Content Contracts](Translation-and-Content-Contracts.md) for the exact reference grammar and illustrative usage.
