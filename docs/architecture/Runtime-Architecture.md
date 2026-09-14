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
- entry/list/selector/popup/component runtimes;
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

Client UI state is organized as explicit surfaces/levels rather than one global mutable page object. A page, popup or selector has an owner, lifecycle and CTX path.

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

See [Data and Storage Architecture](Data-and-Storage-Architecture.md).

## Diagnostics

Request identity spans API Traffic, API logs, API CTX and snapshot folders. Operation Context records semantic operation hierarchy while CTX snapshots preserve selected runtime context before disposal.

These are complementary runtime observations and should not be collapsed into one giant logging structure.

See [Diagnostics and Observability Architecture](Diagnostics-and-Observability-Architecture.md).

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
- [Context Architecture](Context-Architecture.md) for API/UI CTX structure.
- [Expression Architecture](Expression-Architecture.md) for expression hosts/caching/evaluation.
- [Client and UI Architecture](UI-Architecture.md) for portable client/surface/component ownership and the current Express realization.
- [API Architecture](API-Architecture.md) for request/service contracts.
- [Diagnostics and Observability Architecture](Diagnostics-and-Observability-Architecture.md) for correlation and snapshots.
