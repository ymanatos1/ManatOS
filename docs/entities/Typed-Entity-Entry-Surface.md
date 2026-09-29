# Typed Entity Entry Surface

The V2 `EntityEntrySurface` is the semantic controller for one entity-entry `UiLevel`. It owns entry semantics, not DOM or host chrome. The owning `UiLevel` and its `UiContext` remain the invocation/lifetime boundary and canonical CTX remains the only semantic value store.

`prepare()` is callee-owned initialization and runs once. It establishes independent canonical `entry.original` and `entry.current` records plus the canonical `fields.<key>.value` write surface. Field edits use `EntityFieldBinding`, so writes continue through the CTX mutation authority rather than component memory. View mode produces read-only field bindings.

The selected uiView is resolved from canonical entity UI metadata. `switchView()` changes only the effective view projection under `control.presentation.uiView`; it does not recreate the `UiLevel`, `EntityEntrySurface`, `entry.original`, `entry.current`, field state, invocation, dirty state, or other semantic CTX. Later presentation patches may dispose/rematerialize view-owned tabs/regions/components around this stable surface.

This patch intentionally does not transfer production entry rendering from the compatibility runtime. It establishes the typed semantic surface first so that subsequent field, expression, validation, view and persistence migrations have one canonical owner.
