# ManatOS Concepts

This document introduces the concepts that recur throughout ManatOS. It is intentionally compact enough to read early, while each concept links conceptually into the deeper architecture, design, application-design, and reference documentation.

## Application foundation

ManatOS is the overarching **software foundation and architecture**. It composes common domain metadata, runtime services and authoritatively enforced business operations into reusable infrastructure for one or more platforms and applications. The project is not itself a Company record or a legal organization in this documentation.

## Shared Company domain

`Company` is the established **technical domain identifier** for shared business objects and relationships: Users, Person/Organization Principals, contacts, Licenses and external identity administration. It does not define the project’s organizational status. Business identity and commercial entitlements can be reused by multiple applications without being moved into each platform's metadata.

## Platform

A **platform** is a coherent application environment that contributes domain definitions, navigation, capabilities and application composition while using the common foundation. **protoCRM** is a multi-application platform for defining, designing, testing and running metadata-driven applications inside the foundation; independent hosting on a compatible runtime is an architectural realization of that model.

**Panoptes** illustrates a specialized-purpose application whose surveillance domain is currently represented through platform metadata. It is not another application-design environment.

## Application

An **application** defines its own business entities, views, relationships and rules and consumes shared UI, API, security, context, expression and persistence contracts. Application identity is distinct from both the overarching software foundation and the internal shared `Company` domain.

## Entity

An **Entity** is a business-object definition known to the generic ManatOS metadata/runtime/storage infrastructure. An entity has a stable key, fields, relationships, persistence semantics and other entity-level rules. The infrastructure is intentionally generic enough to support both system-owned entities and future entities defined by Applications.

## SysBO

A **SysBO** (System Business Object) is a **system-owned entity naming/category convention**, currently used for shared `Company` domain entities and platform-owned system entities. Examples include company-owned Users, Principals, Licenses and External Authentication Providers, plus the protoCRM-owned Applications entity.

`SysBO` is not a synonym for every entity. Future application-defined, non-systemic entities are expected to use the same generic entity infrastructure without acquiring the `SysBO` prefix merely because they share that infrastructure.

A SysBO's stable entity key is distinct from an individual record's storage-generated identifier.

## Canonical entity metadata

**Canonical entity metadata** describes what a business object _is_: its fields, relationships, calculations, persistence-relevant semantics, and entity contracts. It is not a description of a particular page.

This distinction allows non-UI consumers to work with business objects without understanding tabs, popups, CTX UI topology, or browser components.

## Client

A **client** is a presentation/interaction implementation that consumes ManatOS server contracts. The TypeScript repository includes the established `ui.EJS0` client and the shared UIS implementation hosted by `ui.NG1` (Angular) and `ui.EJS1` (EJS). Additional client technologies may implement the same contracts without moving API/domain/storage authority into a UI adapter.

A UI-capable client may implement ManatOS UI metadata, CTX/context and expression semantics. A non-UI integration client may consume business APIs without those presentation concepts.

## UI metadata

**UI metadata** describes framework-neutral presentation semantics for how a UI-capable client may present and interact with a business object: list behavior, entry tabs, fields, components, actions, presentation rules, and dynamic UI decisions.

Canonical entity metadata and UI metadata are related but intentionally separate concerns.

## CTX

**CTX** is the observable runtime context tree used by the expression/runtime system and developer diagnostics. UI and API hosts build independent CTX trees from authoritative sources while sharing common semantic contracts.

A simplified UI shape is:

```text
ctx
+-- system
+-- company
+-- runtime
|   +-- subsystems
|   +-- entities
|   +-- enums
|   +-- user
+-- flow (when an operation is running)
+-- ui
    +-- level (#control, #state, #layout, #data)
        +-- level (nested child)
```

A simplified API shape is:

```text
$
+-- system
+-- entities
+-- company
+-- api
    +-- level-<call-id>
        +-- user
        +-- level-<subsystem>
            +-- ...
```

CTX is runtime state; it is not itself business persistence. Mutation/lifecycle ownership determines event/dependency behavior on the UI and deterministic request/subsystem cleanup on the API.

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

For a modern UIS Entry, `#data.current` contains the canonical editable record, while `#data.original` is its comparison baseline. Field and aggregate validation/dirty information is derived under `#state.fields` and `#state.entry`. The Entry receives typed changes through its field-action boundary; fields do not maintain a second authoritative record.

The established EJS0 client uses a different legacy field-node representation. Its paths are relevant when describing that implementation, not as the general UIS contract.

## Original, current, and dirty

**Original** means the baseline against which editing is compared. **Current** means the owning Entry's working record. **Dirty** indicates that live state differs from its baseline or, at aggregate level, that an owner-managed transaction contains unsaved changes.

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

A concrete adapter is distinct from a **storage configuration** (one configured connection/target) and from an **adapter family** (shared capability inheritance such as server RDBMS or embedded RDBMS).

## Storage capability

A **storage capability** describes a facility the underlying engine can provide natively, such as atomic transactions, foreign keys, generated columns, triggers or stored procedures. This is different from an authorization capability. Storage capabilities describe implementation possibilities; they do not grant user permission and they do not weaken system semantics when absent.

## System behavioral guarantee

A **system behavioral guarantee** is a storage-independent invariant callers may rely on, such as atomic logical writes, uniqueness, referential integrity or persisted calculations. Every active adapter must provide the invariant, using either a native mechanism or adapter/application fallback.

## Adapter strategy

An **adapter strategy** is the chosen physical mechanism used to satisfy a system behavioral guarantee for one adapter. For example, uniqueness may use a native UNIQUE constraint on a relational engine or an adapter-side uniqueness check for JSON.

## Diagnostic correlation

A **diagnostic correlation ID** (the API request ID) is the stable join key used by API Traffic, API logs, API CTX and persisted diagnostic snapshots for the same request. It is diagnostic identity, not authentication/authorization identity.

## Application Foundation

An **Application Foundation** is the reusable semantic/runtime foundation on which ManatOS platforms and applications are composed: shared metadata, policies, context, expressions, UI/runtime contracts, API behavior, and extension mechanisms. It is a design concept rather than a synonym for one specific application.

## Next reading

For system-wide relationships between these concepts, continue with [System Map](System-Map.md). For precise semantics, use [Design](../README.md) and [Reference](../README.md). For how these concepts become a concrete product, see [Application Design](../README.md) and [protoCRM](../platforms/protocrm/README.md).

## A coherent example of subsystem boundaries

Consider a Post in the Panoptes surveillance domain. Metadata describes its fields and relationships; a named UI View selects the desired List/Entry arrangement; UIS creates an owned surface and derived field state; CTX exposes observable current values; expressions calculate eligible presentation facts; localization resolves labels; API authorization checks the requested write; storage applies the durable operation. None of these individual layers becomes the owner of all others merely because the user sees one form.

That separation is the foundation's central architectural idea: **single semantic ownership, multiple projections and independently enforced authority**. See [System Architecture](../system/System-Architecture.md), [UIS](../clients/UIS-Architecture.md) and [Panoptes](../platforms/panoptes/README.md).
