# Client and UI Architecture

## Purpose

ManatOS defines a **client/UI capability model**, not a dependency on one web framework. A client is any presentation host that consumes ManatOS API contracts, canonical metadata, UI metadata, capability projections and runtime semantics to provide an interactive experience.

The repository currently contains one concrete client implementation: the TypeScript Node.js/Express UI package with server-rendered EJS/Bootstrap presentation and a browser runtime. That implementation is important operationally, but it is **not the architectural definition of the ManatOS UI**. Future Angular, React, mobile, desktop or other clients may implement the same semantic contracts with different rendering, navigation, state-management and transport technologies.

Architecture documentation therefore uses **client**, **UI-capable client**, **client runtime**, and **presentation host** for portable semantics. References to the current Express/EJS/browser implementation are explicitly implementation notes.

## Portable client contract

A conforming UI-capable client is built from server-owned facts and portable presentation contracts:

```text
canonical entity metadata + UI metadata + capability facts + invocation/data
                              |
                              v
                       client composition
                              |
              +---------------+---------------+
              |               |               |
              v               v               v
          UI context      expressions      components
              |               |               |
              +---------------+---------------+
                              |
                              v
                    rendered interaction
                              |
                              v
                       API operations
```

The portable contract is semantic rather than DOM-shaped. It defines what a page/list/entry/popup/selector/component means, how values and permissions are represented, how expressions observe context, and which server operation commits a change. It does not require HTML, EJS, Bootstrap, a browser DOM, Express sessions, React components or Angular services.

## Authority boundary

The client owns presentation and interaction; the API owns protected business truth.

The client may:

- construct navigation and surfaces from metadata and capability facts;
- maintain transient interaction state;
- evaluate client-owned declarative presentation expressions;
- present lists, entries, selectors, popups and composite components;
- show or suppress controls according to projected capabilities;
- collect edits and invoke API commands;
- expose diagnostics for its own runtime.

The client may **not**:

- authorize a protected API operation merely because a control is visible;
- redefine canonical entity/storage semantics;
- persist business state by bypassing API/storage contracts;
- reconstruct sensitive authorization policy from raw relationship/license inputs;
- make UI metadata or client CTX a trusted server-side security token.

Every protected API operation is independently authorized and validated by the API.

## Client context model

The current ManatOS client runtime uses CTX as its observable semantic context. CTX provides stable concepts for metadata expressions and diagnostics: company/system/entity facts, authenticated-user facts, permissions, UI levels, entry fields, state, resources and nested surfaces.

A future client has two valid implementation choices:

1. implement the ManatOS CTX/runtime contracts directly, which maximizes reuse of the shared expression/UI metadata model; or
2. adapt another framework's state model to the same observable semantic contracts at the ManatOS boundary.

Either way, the semantics must remain recognizable. A React store or Angular service must not silently change what `fields.<k>.value`, `entry.original`, permissions, invocation, or nested UI levels mean.

CTX is not a requirement that all clients share one in-memory tree with the API. API CTX and client CTX are independently constructed runtime contexts.

## Surface model

Pages, popups and selectors are hosts for the same recursive surface concept:

```text
surface level
  |
  +-- child/popup/selector level
        |
        +-- child level
              |
              +-- ...
```

Opening a child adds a level owned by that invocation. Closing it disposes the child and its descendants and returns control to the parent. The semantic nesting depth is not fixed by the current web layout.

A mobile client might render a child level as a new screen; a React client might render a modal/route; the current web client may render a popup. Those are presentation choices over the same ownership/lifecycle model.

## Entry runtime

An entry surface combines canonical metadata, UI metadata, API data/facts, invocation/defaults and client state.

```text
canonical metadata ----+
UI metadata -----------+---> entry runtime ---> observable context ---> presentation
API record/facts -------+
invocation/defaults ----+
```

The canonical live scalar authority is the field value. `entry.current` is a projection/read model; `entry.original` is the baseline projection. Dirty/validation/action state derives from those authorities rather than becoming competing record stores.

Create, edit and view are modes of the same semantic entry kind. A read-only client may implement only inspection while still consuming the same metadata and record contracts.

## List and query runtime

A list surface owns query state, returned rows, paging/filtering/sorting presentation and list actions. Authorization row scoping happens before client-visible filtering/paging. A client must never fetch an unrestricted dataset and treat local filtering as security.

Inline editing, if a client supports it, requires an explicit row/edit workspace. Merely displaying columns does not make a list the owner of entry-field state.

## Selectors and references

A selector is a list-like surface opened with selection semantics. Invocation identifies source, target and restrictions. Selection returns a semantic result to its caller.

Reference catalogues are supporting data. Failure to read an optional/forbidden supporting catalogue must not accidentally upgrade or downgrade the primary entity permission. Clients should degrade auxiliary presentation appropriately while preserving the API's primary authorization result.

## Components and workspaces

Reusable components consume metadata and observable context rather than entity-specific globals. Component-owned read models/resources have explicit lifecycle and ownership.

Composite workspaces may own transactional draft state spanning several canonical fields or related entities. That ownership does not transfer persistence authority to the component; commit remains an explicit API/domain operation.

## Declarative actions and presentation policy

Action inventory comes from metadata/runtime composition. Visibility, enabled state and disabled reasons may be declarative expressions over projected facts such as:

```text
permissions.read
permissions.create
permissions.update
permissions.delete
user.permissions.platforms.<platform>.capabilities.platformAccess
```

Generic client infrastructure must not rebuild server policy with role-specific branches when a canonical capability already exists.

Role facts remain useful where the presentation itself is genuinely role-specific, but they are not substitutes for CRUD/platform capability projection.

## Navigation

Navigation is a presentation of available capabilities and contributions, not a second authorization engine. Entity-backed navigation consumes canonical collection capabilities; platform navigation consumes platform capabilities. The API independently enforces the operation when selected.

This is especially important for the four current roles: Admin, Superuser, User and Guest. Their security semantics are defined in [Authentication and Authorization](../security/Authentication-and-Authorization.md), not in client navigation code.

## Diagnostics as a client capability

A capable development client may expose:

- its live client CTX/context state;
- expression definition/current-value inspection;
- dependency/subscriber information;
- client-side operation/error context;
- API Traffic generated by that client;
- request/response details;
- correlated API logs and API/storage CTX snapshots when a diagnostic transport makes them available.

These are diagnostic capabilities, not requirements that every production/mobile client ship the current docked debugger. See [Diagnostics and Observability Architecture](../diagnostics/Diagnostics-and-Observability-Architecture.md).

## Transport and session strategies

The current web implementation uses a UI server/BFF: browser sessions are held by the Node.js/Express UI server, API bearer credentials remain server-side, and the UI server performs API calls on behalf of the browser.

That is one valid client security topology, not the only architectural topology. Another trusted client type may use a different authentication/session mechanism provided it follows the API's supported authentication contracts and does not weaken credential handling or authorization.

Internal/trusted BFF endpoints are not automatically public APIs for arbitrary clients. A future client must use public contracts or introduce an explicitly designed trusted-client boundary where required.

## Current TypeScript/Express realization

The repository's `ui` package currently realizes the client architecture with:

- Node.js/Express as presentation host/BFF;
- EJS/Bootstrap for server-rendered shell/templates;
- browser JavaScript/TypeScript for interactive CTX/runtime behavior;
- website sessions and server-side API-token custody;
- a developer-tools dock containing CTX Viewer, API Traffic and CLI;
- optional co-located filesystem access for development diagnostics.

Implementation-specific development documents may legitimately discuss EJS files, Express middleware, DOM nodes and Bootstrap controls. Those details must not be promoted into portable ManatOS architecture contracts.

## Future client examples

Potential clients include, without architectural preference:

- an Angular web application;
- a React web application;
- a mobile/tablet client;
- a desktop client;
- a specialized operational console;
- a read-only inspection/reporting client.

They may differ in rendering and local state implementation while sharing canonical entity metadata, authorization/capability APIs, business operations, storage-neutral server semantics and—where they opt into metadata-driven UI—the same UI metadata/expression meanings.

## Portability invariants

1. The API/domain/storage architecture does not depend on the current Express UI implementation.
2. Canonical entity metadata is client-neutral.
3. UI metadata describes presentation semantics, not EJS/Bootstrap implementation code.
4. Capability projections are the portable presentation-security facts; clients do not reconstruct server policy.
5. Client context/runtime state is not business persistence or authorization evidence.
6. A client may choose another framework without changing entity, authorization or storage semantics.
7. Current web/BFF filesystem conveniences are deployment-specific and must degrade gracefully when unavailable.
8. Implementation-specific docs may describe the current UI package precisely, but architecture docs identify those details as one realization.

## Audience-specific follow-up

- **System/architecture readers:** [System Architecture](../system/System-Architecture.md) and [Runtime Architecture](../system/Runtime-Architecture.md).
- **Client implementers:** [Client Implementation Guide](Client-Implementations.md).
- **Contract lookup:** [Client Contract Catalog](Client-Contracts.md).
- **Users/developers using a client:** [Client and UI Capabilities](Client-and-UI-Capabilities.md).
- **Security:** [Authentication and Authorization](../security/Authentication-and-Authorization.md).
- **Diagnostics:** [Diagnostics and Observability Architecture](../diagnostics/Diagnostics-and-Observability-Architecture.md).
