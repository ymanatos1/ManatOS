# Multilingual Infrastructure

The multilingual infrastructure separates **language-neutral system meaning** from the text displayed to a reader. Entity identities, authorization, relationships, CTX state and API contracts do not change when a user selects another language; the UI resolves localized descriptions, captions and messages when constructing the presentation.

This is a shared architectural concern rather than a collection of translations attached to individual screens. Metadata names, navigation, reusable components, authentication messages and static content all participate, while retaining distinct ownership and rendering contracts.

## Architecture at a glance

```text
Canonical declarations and runtime facts
      │ language-neutral references, keys and values
      ▼
Shared text catalogues and resolution
      │ selected language + fallback rules
      ▼
Presentation projection
      ├── Metadata / navigation / entity labels
      ├── UIS components, prompts and validation text
      └── Static HTML content and popup fragments
```

The current language catalogue defines `en` (English) and `el` (Greek); the default is English. The catalogue's existence must not be confused with complete translation coverage in every subsystem.

## Reading map

- [Multilingual Infrastructure](Multilingual-Infrastructure.md) — language/catalogue ownership, evaluation boundaries, client integration and invariants.
- [Translation and Content Contracts](Translation-and-Content-Contracts.md) — exact key resolution, parameterized messages, content translation, examples and extension discipline.

## Related subjects

- [Metadata](../metadata/README.md) — declaration ownership and text-bearing metadata.
- [UIS Architecture](../clients/UIS-Architecture.md) — presentation projections and adapter responsibilities.
- [CTX](../context/README.md) — runtime state, which must not contain translated copies of canonical facts.
- [Documentation Browser](../system/Documentation-Browser.md) — static document/content presentation is a distinct concern from metadata translation.
