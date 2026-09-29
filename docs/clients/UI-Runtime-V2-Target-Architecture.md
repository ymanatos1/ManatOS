# UI Runtime V2 Target Architecture

Status: implementation target for the TypeScript browser-runtime migration.
Baseline: `src(20260918-211432)`.

## 1. Purpose

V2 replaces fragmented browser-runtime ownership with a typed, compositional runtime while preserving current ManatOS semantics. It is not a file-by-file JavaScript translation. The kernel must remain small enough that new entities, fields, components, relationships, hosts and surface types normally arrive through registered contracts and metadata rather than changes to the kernel.

Auth and Storage Configuration remain compatibility/deferred areas until the general runtime is established.

## 2. Foundational model

There is one `UiRuntime` per browser application and one structural root `UiLevel`. Every live user surface executes in a `UiLevel`; nested surfaces execute in child levels. Normal page navigation replaces the current page subtree beneath the structural root rather than nesting the new page under the old page.

A level is an invocation/context/lifetime boundary, not an entry/list/popup class. The following dimensions are orthogonal:

- **Host**: physical presentation such as page, popup or embedded. Hosts are registered identifiers, not a closed kernel enumeration.
- **Surface**: semantic runtime such as entity entry, entity list, selector, Organization workspace or message/question surface.
- **Mode**: invocation semantics such as create, edit, view or select.
- **uiView**: metadata-selected presentation of the same live surface.
- **Components**: reusable presentations bound to compatible context/data capabilities.

## 3. Invocation and level opening

The caller allocates/prepares a child level with an invocation context. The invocation carries references and parameters, not copied resolved metadata. Typical inputs are surface type, host, entity identifier, requested uiView, mode, record/input information and caller restrictions.

The callee owns initialization. It reads invocation, resolves canonical metadata from registries, acquires required data/resources, completes its semantic CTX, resolves the effective uiView, establishes component contexts/bindings, materializes and activates.

**Rule:** caller owns invocation; callee owns initialization.

Invocation is treated as the immutable description of the call. Derived/live state belongs elsewhere in the level context.

## 4. CTX ownership

CTX is canonical observable runtime state, not a debug copy of separate runtime state. `UiLevel`, surface controllers and bindings hold direct references/projections into their canonical CTX objects. There must not be independent `UiLevel state -> binding state -> CTX state` models synchronized by copying.

A level has universal namespaces only where they are genuinely universal, for example invocation, control/lifecycle, state and resources. Surface-specific nodes such as entry/fields exist only for surfaces that need them. Child levels form nested level contexts.

Components may have subordinate component contexts. A component is not a child UiLevel merely because it has state. Only a genuinely nested surface receives a child UiLevel.

## 5. Bindings

Bindings are CTX-native semantic connections. They may read, write where permitted, subscribe, expose validation/policy state and participate in the same dependency/event architecture used by CTX expressions.

Bindings may target entity fields, entities, lists, list filters, collections, relationships, configuration/preferences, local surface state, resources or appropriate arbitrary CTX paths. Binding types are extensible.

Components declare compatible binding requirements/capabilities. Entity/field metadata does not permanently dictate one component.

## 6. Components

Components are reusable presentations/interactions. A uiView chooses components according to content and purpose. The same semantic field or list may be represented by different compatible components in different views.

A list is semantic/query state, not inherently a table. A field is semantic metadata/state, not inherently an input control. Related collections are semantic relationships/collections, not inherently one tab renderer.

Component-local presentation state may be view-lifetime. Semantic state that must survive rematerialization must live in the owning surface CTX, not only in component memory or DOM.

## 7. Surface presentation and uiViews

A resolved surface presentation can include:

- title/caption and optional contextual presentation;
- caption tools;
- action regions/rows;
- layout/regions;
- optional tabs;
- components.

Tabs are optional and range from simple containers to conditional, lazy, resource-aware or stateful compositions. Sophistication is composed through behavior/capabilities rather than a proliferating inheritance hierarchy.

Switching uiView keeps the same UiLevel and semantic surface. It re-resolves and refreshes all view-controlled presentation, normally tabs/components/actions and, when metadata requests it, caption/title or other presentation. It must not recreate invocation, original/current semantic data, dirty state or other level-lifetime state.

Opening-purpose state remains available so a view label cannot accidentally overwrite a purpose-specific popup caption unless the effective view explicitly controls that caption.

## 8. Actions

Actions are semantic commands independent of button placement. Presentation decides whether an action appears in an action row, toolbar, list row, caption tool, menu or another compatible region.

Execution resolves against the current level/surface environment. A semantic Save action can therefore validate and persist to a repository, commit to an aggregate/parent-owned working value, or return validated data to a caller according to the surface/invocation persistence strategy. Separate action types are introduced only when semantics genuinely differ.

## 9. Nested levels and results

A nested surface is invoked as a child level with its own invocation and CTX. The caller awaits a typed result envelope containing status and optional data/reason. The child does not mutate arbitrary caller DOM/state. The caller interprets returned data and updates its own CTX when appropriate.

This model covers popup entry creation, record selectors, embedded related-member editors, nested picture editors and future nested surfaces.

UI ownership, persistence ownership, transaction ownership and result ownership are distinct concepts. A child level may be parent-owned for persistence while remaining independently scoped for UI lifecycle and validation.

## 10. Metadata resolution

Runtime calls transport metadata references/identifiers, not large metadata copies. The callee resolves from canonical registries. Resolution composes canonical entity/surface metadata, uiView inheritance/overrides, invocation restrictions, permissions/policy, host constraints and other relevant definitions into one effective runtime definition.

After resolution, presentation/runtime consumers use the effective definition; they do not reach sideways into raw `common`/base metadata. This is an explicit invariant derived from previous list-view inheritance regressions.

## 11. Resources and expressions

Effective surface/view/component resolution drives resource planning. Active components declare requirements; acquisition is lazy where appropriate and request-lifetime duplicate reads remain deduplicated. Completed entry-opening optimization contracts A1-B2 are migration invariants rather than discarded work.

Expressions and dependencies operate on CTX-observable state and are independent of DOM. Calculated values, visibility, enabled/readonly/required state, defaults, filters, actions, tabs, component policy and future declarative decisions can consume the same dependency architecture. Process-local AST caches remain one per UI process and one per API process, lazy and empty at startup.

## 12. Lifecycle

Level opening is transactional: allocate -> establish parent/invocation/CTX -> prepare semantic state -> resolve -> materialize -> activate. Failure rolls back incomplete DOM, subscriptions, resources and level registration.

Closing/disposal follows the runtime ownership tree. Descendants are handled before their owning level disappears. Host relationship policy determines interaction behavior: modal popup children can deactivate/block their caller while embedded children normally leave the parent active.

Normal unsaved closure and abnormal-interruption recovery remain distinct. Create Organization's intentional draft persistence remains an explicit designed exception to normal-close discard semantics.

## 13. Hosts

Host implementations own physical presentation mechanics, not surface semantics. PopupHost owns stacking, backdrop, focus trapping, geometry, caption chrome, keyboard behavior and modal barriers. PageHost owns page placement/navigation integration. EmbeddedHost owns local placement. Future hosts are registered without changing UiLevel.

Iframe versus direct popup hosting is an implementation decision below the host contract. The unfinished D1/D2 optimization audit is evaluated after typed semantic ownership is stable.

## 14. Registries and extension boundary

Typed registries provide surface implementations, hosts, components, bindings, actions, persistence strategies, relationship strategies and resource providers. Identifiers remain open/extensible rather than closed unions in the kernel.

Metadata selects/configures trusted registered functionality; metadata is not arbitrary executable browser code. New compatible implementations should normally be registerable without edits to UiRuntime or UiLevel.

## 15. Diagnostics

Runtime objects expose stable diagnostic identity for levels, CTX paths, surfaces, views, components, bindings, resources, subscriptions, expressions, validation and dirty contributors. The debugger observes this model and must not become an alternative state owner.

## 16. Deferred specialized areas

Auth flows/popups and Storage Configuration are intentionally not used to shape the first general-runtime model. They remain operational through compatibility boundaries until the dynamic Entry/List/component/relationship runtime is established, then receive separate audits to determine what naturally adopts generic contracts and what remains specialized.

## 17. Completion invariants

The migration is complete only when:

1. every general browser semantic responsibility has one canonical typed owner;
2. existing behaviors pass lifecycle/scenario tests, including recursive page/popup/embedded nesting;
3. uiView switches preserve semantic level state and refresh only view-controlled presentation;
4. components mutate/read canonical CTX through compatible bindings;
5. nested surfaces communicate through invocation/result contracts;
6. raw metadata is resolved centrally and consumers use effective definitions;
7. obsolete JavaScript owners are removed rather than permanently synchronized with TS replacements;
8. representative synthetic extensions can be registered without modifying the runtime kernel.

## Typed component runtime boundary

A registered TypeScript component definition declares the binding contract it accepts and creates a live component controller from one `UiLevel`, one component-owned CTX scope, and one CTX-native binding. `UiComponentInstance` owns only implementation lifecycle and disposers; semantic values remain exclusively in canonical CTX behind the binding. Component/view disposal releases component-lifetime subscriptions and resources. Semantic state that must survive view rematerialization belongs above the component scope. Production field renderers remain on the compatibility path until their ownership is deliberately transferred.

## Typed presentation composition boundary

A `UiPresentationInstance` is view-owned composition, never a semantic state owner. It contains optional top-level regions and tabs; each region owns the component instances placed into it. Mount/unmount and tab activation control component presentation lifecycle, while disposal deterministically releases the complete view-owned component tree. Tab selection is CTX-observable presentation state under the owning level and may be reused when a view is rematerialized. Entry/list semantic state such as `entry.current`, `entry.original`, dirty state and invocation identity remains outside the presentation instance and is therefore not reconstructed from controls during tab changes or view rematerialization.

Tabs are optional composition rather than a required surface shape. Regions are semantic placement slots rather than DOM containers, allowing later hosts/layout renderers to decide physical markup independently. The definitions contain data only; executable behavior remains in trusted registered TypeScript components/runtime services.
