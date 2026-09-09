# Metadata Catalog

## Canonical BO metadata

Canonical definitions identify an entity and describe fields, relationships, calculations, entry representation and persistence semantics. Field types include `guid`, `string`, `email`, `telephone`, `boolean`, `number`, `date`, `datetime`, `duration`, `version`, `enum` and `reference`.

A calculation augments a canonical field. Persisted calculations opt the derived value into persistence materialization; dependencies/triggers describe assisted recalculation. Relationships define navigation and mutation consequences such as cascade, unlink, set-null, restrict or retain according to the relationship contract.

## UI metadata

UI definitions describe list columns/filters/actions, entry tabs, field/component presentation, selectors and dynamic policy. A dynamic value may be static or expression-backed. Effective UI metadata is resolved for the current invocation/context rather than copied into canonical BO definitions.

## Entry representation

Canonical entry representation supplies semantic name/type/description/status used by generic lists, references, selectors, related collections and hierarchy presentation. UI metadata may decorate representation with icons/layout but should not invent another semantic identity.

## Invocation/default precedence

Static metadata defaults, caller defaults and invocation overrides are inputs to initialization. After initialization, live field state belongs to the entry runtime; invocation data is not retained as a competing field-value store.
