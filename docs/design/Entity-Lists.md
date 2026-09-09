# Entity Lists

The generic entity-list surface composes canonical entity metadata with UI list metadata, authorization/capability facts and query state.

A list owns its projected entries, filters, search, paging and list actions. Calculated records are projected before publication into CTX so every consumer sees the same effective record. Reference values use canonical entry representation rather than raw identifiers.

Filtering that belongs to data selection is carried through the API/query contract. Exception predicates remain canonical structured expressions so storage implementations can eventually translate them natively. UI-only post-filtering is not an architectural substitute for selection semantics.

List row actions are metadata/runtime actions rather than entity-specific EJS branches. Opening an entry creates a child UI level while preserving the list as its parent context.
