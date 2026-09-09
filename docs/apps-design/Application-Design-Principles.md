# Application Design Principles

Design domain concepts first: entities, relationships, invariants and permissions. Then map reusable interaction to UI metadata and expressions. Use custom components for genuinely compound interaction, not as an escape hatch from metadata.

Keep domain truth independent of one screen. Keep security on the API. Make observable, side-effect-free decisions declarative where useful. Preserve structured predicates/relationships through the data boundary. Reuse canonical entry representation so the same record has the same semantic identity in lists, selectors and related views.

Application documentation should state business meaning as well as technical representation.
