# Runtime Architecture

## Runtime topology

ManatOS is one semantic system whose authoritative server runtime is client-independent. The **current repository implementation** uses the following hosts:

```text
shared semantic package
       |            \
       v             v
   API process     UI server
       |             |
       +---- HTTP ---+
                     |
                     v
                  browser
                UI runtime
```

`shared` is not a fourth runtime owner. It contains contracts and implementations whose semantics genuinely need to be common across hosts: domain/entity metadata, UI metadata types, expression language, policies, platform definitions, error contracts and structural CTX primitives.

## Ownership by host

### API process

The API owns authoritative business and security behavior:

- authentication and API sessions;
- authorization and safe capability projection;
- application services and named protected commands;
- canonical metadata exposure;
- relationship/integrity enforcement;
- storage adapters, configuration and persistence;
- API operation context and API CTX;
- public/internal HTTP contracts;
- server-side audit/configuration/security concerns.

### Current web presentation host / BFF

The current Node.js/Express UI server owns presentation hosting and the secure browser/API bridge for the repository web client:

- website sessions;
- server-rendered pages and initial presentation composition;
- API token custody on behalf of the browser session;
- API client calls and API Traffic capture;
- loading canonical metadata/UI metadata from the API;
- serving browser runtime assets;
- local-development diagnostic filesystem integration where available.

This BFF must not become a second business-service layer. A future Angular/React/mobile client may use another presentation/authentication topology without changing API/domain/storage authority.

### Current browser client runtime

In the current web realization, the browser owns live interactive presentation state:

- UI CTX surfaces and levels;
- live field state;
- expression-driven presentation decisions;
- entry/list/selector/component behavior hosted through the browser UI-level runtime;
- reactive dependency/event handling;
- developer inspection/debugger UI;
- client-side interaction state that does not belong in business persistence.

## Independent API and client CTX

The API and a CTX-capable client each have their own runtime context. The current browser client implements this directly. They share structural concepts and semantic conventions but are not synchronized copies.

The client CTX models interactive surfaces and user editing. The API CTX models request execution, user/security context and nested subsystem operations.

No runtime should serialize its entire CTX into the other process merely to keep the trees “in sync.” Shared facts should come from authoritative contracts/APIs and be represented independently in each host as needed.

## API concurrency model

The API owns one global tree with stable roots and parallel request branches:

```text
$
├── company
├── system
├── entities
└── api
    ├── level-<request-A>
    │   ├── user
    │   └── child levels...
    └── level-<request-B>
        ├── user
        └── child levels...
```

A small AsyncLocalStorage-based execution pointer identifies the current request/level. It does not replace the tree and it does not hold semantic business state. Its purpose is concurrency-safe runtime addressing.

Nested operations can therefore resolve ancestor state/resources while independent requests remain isolated.

## Client surface model

Client UI state is organized as explicit surfaces/levels rather than one global mutable page object. The fundamental hosts are `page`, `popup`, and `embedded`; entry/list/selector/custom describe what a hosted level presents. Every level has an owner, lifecycle and CTX path.

The current browser implementation centralizes topology/lifecycle in `public/js/runtime/ui-host-runtime.js`. Popup infrastructure delegates child creation to that authority; embedded children use the same `openChildSurface` path with different parent-activation semantics. This file location is an implementation detail, while the single-host-authority rule is architectural.

UI views are orthogonal to hosting. `resolveSysBOUIView()` composes common record UI metadata with a selected named view. The view key (`main`, `quickView`, `quick`, ...) identifies the concrete presentation; `viewType` (`full`, `quick`, ...) identifies its family. A view does not own a second record, CTX tree, validation model or persistence path.

Entry scalar values have one canonical live authority at field level. Whole-record `current`/`original` projections are mirrors/read models rather than competing writable copies.

Components and workspaces may own resources/aggregate state with explicit lifecycle rather than hiding state in arbitrary globals.

## Metadata-to-runtime pipeline

A metadata-driven page follows this conceptual path:

```text
canonical entity metadata + UI metadata
                |
                v
       client presentation composition
                |
                v
         client UI bootstrap
                |
                v
          CTX surface/level
                |
        +-------+--------+
        |                |
        v                v
 expressions         components
        |                |
        +-------+--------+
                v
        events/dependencies
```

The renderer should not hardcode decisions that belong in metadata/expression/runtime infrastructure.

## Expressions

Expression source is the portable semantic contract. Each execution host maintains its own process-local/runtime-local parsed AST cache and evaluates expressions using the shared language semantics.

ASTs are not copied between UI surfaces or between API/UI processes as invocation state. Source identity plus host-local caching preserves both portability and efficiency.

Expressions are side-effect-free. Mutation remains owned by explicit runtime/service operations.

## Events and reactivity

Runtime mutation should have one authoritative write path and a corresponding event/dependency story. Derived decisions recalculate because relevant observable state changed, not because every component globally refreshes itself.

The current client runtime uses CTX events/dependency matching heavily for live UI behavior. API runtime levels are shorter-lived and more operation-oriented, but structural CTX semantics remain compatible.

## Storage execution

Storage is a nested API subsystem, not a separate application process. When an HTTP request enters storage, `runStorageOperation()` creates a child API CTX level that exposes the active adapter, family, effective capabilities and behavior strategy.

Background/bootstrap storage work runs without manufacturing a synthetic HTTP request level.

See [Data and Storage Architecture](../storage/Data-and-Storage-Architecture.md).

## Diagnostics

Request identity spans API Traffic, API logs, API CTX and snapshot folders. Operation Context records semantic operation hierarchy while CTX snapshots preserve selected runtime context before disposal.

These are complementary runtime observations and should not be collapsed into one giant logging structure.

See [Diagnostics and Observability Architecture](../diagnostics/Diagnostics-and-Observability-Architecture.md).

## Deployment topology

The current Express UI and API may be exposed by a reverse proxy as one public site even though they remain separate processes. This is a deployment of one client, not a system requirement. Business/runtime code should not rely on them sharing a working directory or filesystem.

Local development may exploit co-location for convenience (for example API Traffic reading local API log/snapshot files), but that behavior must degrade gracefully when the processes are deployed separately.

## Shared-package boundary

Code belongs in `shared` when its semantics must genuinely be common, not merely because two packages happen to import similar code.

Good shared candidates include:

- domain contracts;
- canonical metadata types/registries;
- expression parser/evaluator semantics;
- transport-neutral errors;
- policies/capability types;
- CTX structural runtime primitives.

Host-specific lifecycle, filesystem access, HTTP middleware or DOM behavior should stay with the owning host.

## Runtime invariants

- API is authoritative for protected business operations.
- A client is authoritative only for its own live interactive presentation state.
- The current Express UI server bridges presentation and API without becoming a duplicate domain layer; other clients may use another approved topology.
- API/UI CTX are independent trees.
- one runtime owner exists for each mutable state concern;
- request concurrency never depends on a global mutable current request;
- declarative decisions should observe CTX rather than page-specific globals;
- storage/diagnostics are nested subsystems, not sources of business-policy duplication.

## Audience-specific follow-up

- [System Architecture](System-Architecture.md) for the full system decomposition.
- [Context Architecture](../context/Context-Architecture.md) for API/UI CTX structure.
- [Expression Architecture](../expressions/Expression-Architecture.md) for expression hosts/caching/evaluation.
- [Client and UI Architecture](../clients/Client-Architecture.md) for portable client/surface/component ownership and the current Express realization.
- [API Architecture](../api/API-Architecture.md) for request/service contracts.
- [Diagnostics and Observability Architecture](../diagnostics/Diagnostics-and-Observability-Architecture.md) for correlation and snapshots.

### Stage 20 host/surface opening contract

The typed browser runtime now defines executable host and surface registry contracts and one canonical `UiRuntime.open()` pipeline. A request carries one invocation, canonical CTX, level identity and optional parent. The host strategy owns **placement and topology**; after the host mounts the `UiLevel`, the semantic surface owns **surface initialization**. Host and surface are therefore orthogonal dimensions rather than separate application runtimes.

During the Stage 20 migration, the production compatibility host may still be observed through `UiRuntime.observe()`. That bridge is transitional. New typed opening semantics must target `UiRuntime.open()` rather than introduce another page/popup/embedded dispatcher. Direct browser-host migration and iframe removal are later Stage 20 steps.

#### Direct Entry popup hosting

Entity Entry popups are hosted directly in the owning browser document and `UiLevel`. The UI server still supplies the canonical host-neutral SSR Entry markup plus factual bootstrap/context resources, but it does not create a second application shell. The popup runtime hydrates the already-opened Entry surface, mounts the markup beneath that surface, and lets the re-entrant Entry installers bind to its exact CTX path.

An Entry popup therefore has one semantic owner and one runtime: there is no Entry iframe, cross-window CTX attachment, event-forwarding bridge, or nested application runtime. Nested popups remain child `UiLevel`s in the same canonical runtime stack. Page/Popup/Embedded are hosting choices around the same Entry semantics.
