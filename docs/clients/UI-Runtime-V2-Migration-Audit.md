# UI Runtime V2 Migration Audit and Plan

Baseline: `src(20260918-211432)`.
Target: [UI Runtime V2 Target Architecture](./UI-Runtime-V2-Target-Architecture.md).

## Migration rule

This is an ownership transfer, not a file translation. For every responsibility: identify the current canonical owner, establish the typed owner and behavioral tests, route production execution to it, then remove/bypass the previous owner. Do not maintain two semantic state engines.

## Current ownership groups

The current handwritten browser runtime under `ui/public/js` still owns substantial execution in these groups:

| Current group                                                                              | Responsibilities to transfer                                                        | Target owner                                                             | Timing                 |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------- |
| `runtime/ui-host-runtime.js`, `context-runtime.js`, bootstrap/opening runtime              | level identity/tree, CTX construction/mutation, opening                             | UiRuntime/UiLevel/CTX runtime                                            | early                  |
| `sysbo/entry/entry-*`, `form-runtime.js`, `state.js`, `field-state.js`, `field-runtime.js` | entry initialization, semantic current/original, fields, views, reactive form state | EntityEntry surface + bindings/components                                | core                   |
| `sysbo/entry/expression-runtime.js`, policy/focus                                          | dependency evaluation, presentation policy/focus                                    | CTX dependency/policy + host/component adapters                          | core                   |
| `sysbo/entry/save.js`, workspace recovery                                                  | persistence/discard/recovery                                                        | persistence strategies + level lifecycle/recovery                        | core                   |
| picture/rich-text runtimes                                                                 | complex field presentation/editing                                                  | registered components bound to canonical CTX                             | after component kernel |
| list runtimes                                                                              | list query/view/action/browser presentation                                         | typed List surface + list component; reuse existing TS EntityListRuntime | core                   |
| popup/entry-popup/record-selector                                                          | popup mechanics, nested entry/select results                                        | PopupHost + generic child invocation/result + surfaces                   | after level core       |
| related-list/collection editors                                                            | relationships and parent-owned child edits                                          | relationship/collection bindings + child levels                          | after entry core       |
| hierarchy runtime                                                                          | Organization workspace/tree/draft/relationships                                     | specialized Organization surface using generic contracts                 | late                   |
| debugger/CLI                                                                               | runtime/CTX introspection                                                           | typed diagnostics adapters                                               | late                   |
| shell/preferences/connectivity/busy                                                        | application/browser services                                                        | typed browser services where general                                     | late/selective         |
| auth runtimes                                                                              | authentication-specific flows                                                       | deferred compatibility/specialized audit                                 | deferred               |
| configuration/storage-specific runtimes                                                    | specialized configuration flows                                                     | deferred compatibility/specialized audit                                 | deferred               |

The migration must also audit inline EJS scripts and browser globals because ownership is not limited to standalone JS files.

## Patch sequence

1. **Browser TS foundation** — add an application-runtime TS browser bundle boundary and architecture tests; load nothing in production yet.
2. **UiRuntime/UiLevel skeleton** — structural root, IDs, registry, parent/children, diagnostic identity; mirror current page without taking semantic ownership.
3. **CTX ownership** — typed level CTX construction, traversal, mutation and subscriptions; direct canonical references.
4. **Level lifecycle** — transactional open/activate/return/close/dispose, recursive cleanup and root page replacement.
5. **Registries/contracts** — typed open registries and compatibility/capability resolution.
6. **Bindings** — CTX-native value/entity/collection/list/local bindings and subscription/disposal contracts.
7. **Component runtime** — component lifecycle, binding compatibility, component contexts and diagnostics.
8. **Presentation composition** — title/caption, caption tools, action regions, layouts, tabs/regions and view-lifetime ownership.
9. **Entity Entry surface** — invocation resolution, original/current, field contexts and mode semantics.
10. **Field mutation** — canonical live field/current mutation and projection through bindings.
11. **Expressions/policy** — calculated/dependent values, visibility, enabled/readonly/required/default policy.
12. **Validation/dirty** — validation aggregation and semantic dirty contributors.
13. **uiViews** — effective resolution and complete view-controlled rematerialization without semantic reinitialization.
14. **Actions/persistence** — semantic actions plus repository/return-to-caller/aggregate persistence strategies.
15. **Recovery** — abnormal recovery separated from normal-close discard and intentional drafts.
16. **General field components** — simple scalar/reference/date/enum/etc. presentations.
17. **Rich components** — picture/cropper, pictures, rich text and composite controls.
18. **Relationships/collections** — selectors, related lists, parent-owned child editors and typed child results.
19. **List surface** — semantic query/filter/sort/page/select/action state with table as a component.
20. **Hosts** — PageHost/PopupHost/EmbeddedHost ownership; nested modal/focus/geometry; evaluate direct versus iframe hosting after semantic equivalence.
21. **Organization/hierarchy** — migrate workspace, hierarchy, relationship and draft behavior onto generic contracts.
22. **Diagnostics/shell/cleanup** — runtime-native debugger, selected general browser services, remove obsolete JS owners and enforce architecture.

Auth and Storage Configuration remain deferred unless a preceding patch requires only a narrow compatibility adapter to keep them working.

## Required gates for every ownership-transfer patch

1. Full existing `npm run verify-run` remains green.
2. Behavioral tests execute the migrated lifecycle rather than relying only on source-string assertions.
3. Architectural tests prove the previous implementation no longer owns the migrated responsibility.
4. Extension-point patches include a synthetic registered implementation proving kernel modification is unnecessary for a compatible extension.

## Mandatory end-state scenarios

The final matrix must cover list/create/edit/view pages; entry/list/selector popups; page-popup-popup and page-embedded-popup nesting; embedded list-entry; related-member local commit; references; picture/cropper; rich text; calculated/dependent fields; policy and permissions; validation; failed/successful save; save-and-close; cancel/discard; unsaved-close question; page navigation; popup blocking versus embedded parent activity; recovery; Create Organization draft persistence; Organization hierarchy editing; list views/filter/sort/page/actions; resource planning/deduplication; CTX/debugger visibility; dependency cleanup; and recursive level/subscription disposal.

## Implementation checkpoint — Patch 2

Patch 2 introduces the typed `UiRuntime` and `UiLevel` identity/topology skeleton. The browser now loads the generated runtime bundle after the existing canonical CTX runtime and mirrors the current `ctx.ui.level` chain beneath one typed structural root. The mirror is observation-only: it does not open, close, mutate, persist or initialize production surfaces, so no semantic ownership has been duplicated. CTX ownership remains scheduled for Patch 3.
