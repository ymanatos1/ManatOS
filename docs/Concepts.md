# ManatOS Concepts

This document introduces the concepts that recur throughout ManatOS. It is intentionally compact enough to read early, while each concept links conceptually into the deeper architecture, design, application-design, and reference documentation.

## Company

The **Company** is the top-level ManatOS product/catalog owner. It contributes company-wide identity, branding, navigation, entity availability, and platform composition. Company-level capabilities are not tied to whichever platform is currently selected.

The current company catalog is ManatOS Software Solutions.

## Platform

A **Platform** is a coherent product/domain environment hosted by ManatOS. A platform contributes its own applications, navigation, entity exposure, and platform-specific behavior while using the common ManatOS foundations.

**protoCRM** is currently the concrete platform. The company model is multi-platform even though only one platform is currently configured.

## Application

An **Application** is a platform-level business capability. Applications participate in platform composition and access/licensing semantics. They do not require a separate copy of the core runtime.

## SysBO

A **SysBO** (System Business Object) is a business/system entity known to the generic ManatOS infrastructure through canonical metadata. A SysBO has a stable entity key, fields, relationships, persistence semantics, and other entity-level rules. Examples include Users, Principals, Applications, Licenses, and External Authentication Providers.

A SysBO's stable entity key is distinct from an individual record's storage-generated identifier.

## Canonical entity metadata

**Canonical entity metadata** describes what a business object _is_: its fields, relationships, calculations, persistence-relevant semantics, and entity contracts. It is not a description of a particular page.

This distinction allows non-UI consumers to work with business objects without understanding tabs, popups, CTX UI topology, or browser components.

## UI metadata

**UI metadata** describes how a UI-capable client may present and interact with a business object: list behavior, entry tabs, fields, components, actions, presentation rules, and dynamic UI decisions.

Canonical entity metadata and UI metadata are related but intentionally separate concerns.

## CTX

**CTX** is the observable runtime context tree used by the expression/runtime system and developer diagnostics. Its major public branches include system, entities, company, user, and UI state.

A simplified shape is:

```text
ctx
+-- system
+-- entities
+-- company
+-- user
|   +-- fields
|   +-- permissions
+-- ui
    +-- level
        +-- level
            +-- ...
```

CTX is runtime state; it is not itself business persistence. Mutation through CTX is significant because mutation ownership also determines event publication, dependency propagation, and lifecycle behavior.

## UI level

A **UI level** is one node in the recursive active UI chain. Pages and popups use the same recursive model:

```text
ctx.ui.level
    +-- level
        +-- level
```

Opening a child selector or popup adds a deeper level; it does not change which parent level owns the parent form's fields. This ownership distinction is important for correct field mutation and expression scope.

## Surface

A **surface** is the internal runtime object represented publicly through a UI level. “Surface” is useful when discussing runtime ownership and lifecycle; the public CTX topology is the recursive UI-level chain rather than a second parallel surface tree.

## Entry

An **entry** is the interactive representation of one business-object record. Entry state separates baseline data, live field state, derived whole-record projections, facts, validation, and aggregate transaction state.

## Field state

For a scalar entry field, `fields.<field>.value` is the canonical live value. The field also owns its baseline (`originalValue`) and derived state such as dirtiness and validation information.

The entry-level `current` and `original` records are projections/mirrors of field authority rather than competing writable copies. This single-authority rule prevents two representations of the same value from drifting apart.

## Original, current, and dirty

**Original** means the baseline against which editing is compared. **Current** means the whole-record projection of current field values. **Dirty** indicates that live state differs from its baseline or, at aggregate level, that an owner-managed transaction contains unsaved changes.

Aggregate dirtiness is intentionally broader than scalar-field dirtiness because compound editors/workspaces can own changes that are not represented by a single scalar field.

## Fact

A **fact** is a runtime/API-safe observation exposed for decisions but not treated as a persisted entity field. Facts allow expressions to observe information that is relevant to behavior without pretending that information belongs to the entity's stored record.

## Expression

An **expression** is a declarative, side-effect-free calculation or decision written in the shared ManatOS expression language. Typical uses include calculated values, visibility, editability, action state, status presentation, and structured predicates.

The governing principle is that a decision depending only on observable state should be considered for declarative expression form rather than being hidden in page-specific imperative branching.

Expression source is the portable contract. Each execution host parses/compiles that source through the shared language implementation and may cache its runtime-local representation.

## Dependency

A **dependency** describes which observable changes can invalidate a derived value or decision. CTX mutation and dependency matching allow the runtime to recalculate affected behavior without treating every state change as unrelated global refresh work.

## Event

An **event** is part of the causal story of a runtime mutation. One logical change should have one authoritative mutation path and a corresponding event/dependency propagation story, rather than multiple writers independently announcing versions of the same change.

## Capability

A **capability** is an authoritative statement about whether an operation is permitted in a particular context. The server owns authorization. The UI may consume projected capability facts to render actions correctly, but hiding or disabling a UI action is never a substitute for server authorization.

## Relationship

A **relationship** describes semantic links between business objects, including inverse relationships and delete behavior such as cascade, unlink, set-null, restrict, or retain. Relationship semantics belong to canonical metadata/business behavior rather than being reconstructed independently by individual screens.

## Selector

A **selector** is a list-like child surface opened with selection semantics. It identifies its invocation/source context and returns a semantic selection result to its caller. A selector does not gain ownership of the parent entry merely because it temporarily becomes the deepest UI level.

## Popup

A **popup** is a child UI level with an explicit lifecycle. Popups share the recursive UI topology and must respect the ownership of the surface that opened them.

## Component

A **component** is reusable UI behavior composed through metadata and CTX rather than entity-specific globals. Components may expose owner-managed runtime data through resources when they need host-neutral state beyond ordinary scalar fields.

## Workspace

A **workspace** is an owner-managed transactional working model for compound editing. A hierarchy workspace, for example, can own a baseline graph and a working graph containing multiple coordinated changes. Its commit boundary is the aggregate operation, not a sequence of unrelated child saves.

## Resource

A **resource** is component/surface-owned runtime data made observable for component behavior without misrepresenting that data as a persisted entity field. Resources have explicit ownership and lifecycle with their containing runtime owner.

## Storage adapter

A **storage adapter** implements persistence behind ManatOS storage contracts. Query semantics remain structured where possible so capable adapters can translate filtering, authorization, or exception predicates into native datastore selection rather than requiring UI-side or post-materialization filtering.

## Application Foundation

An **Application Foundation** is the reusable semantic/runtime foundation on which ManatOS platforms and applications are composed: shared metadata, policies, context, expressions, UI/runtime contracts, API behavior, and extension mechanisms. It is a design concept rather than a synonym for one specific application.

## Next reading

For system-wide relationships between these concepts, continue with [System Map](System-Map.md). For precise semantics, use [Design](design/README.md) and [Reference](reference/README.md). For how these concepts become a concrete product, see [Application Design](apps-design/README.md) and [protoCRM](apps-design/protocrm/README.md).
