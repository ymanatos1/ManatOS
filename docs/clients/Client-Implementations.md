# Client Implementation Guide

## Scope

This guide is for contributors implementing or extending a ManatOS client. The repository contains three TypeScript UI applications: `ui.EJS0` as the established separate EJS implementation, and `ui.NG1` / `ui.EJS1` as hosts of the `shared.UI` semantic framework through the `shared.UI.NG` and `shared.UI.EJS` adapters. The contracts below also support other UI technologies without transferring API authority to their presentation layers.

## Start from contracts, not templates

A new client should treat these as authoritative inputs:

1. public API and authentication contracts;
2. canonical entity metadata;
3. UI metadata where the client participates in metadata-driven presentation;
4. collection/record/platform capability projections;
5. expression-language semantics where declarative UI rules are supported;
6. entity relationship/default/calculation semantics exposed through the API;
7. diagnostic correlation IDs for calls the client originates.

Do not infer common contracts from one adapter's templates. Begin with shared metadata and `shared.UI` ownership; an EJS or Angular template is a projection of those contracts.

## Minimum client responsibilities

A general interactive client needs to authenticate through a supported topology, call the API, handle standard envelopes/errors, consume capability facts, maintain local interaction state, and present server-authorized data. A metadata-driven client additionally needs to interpret UI metadata, represent surface/entry/list state, and evaluate supported declarative expressions consistently.

A client must never use hidden controls, local role checks or local row filtering as the security boundary.

## Capability consumption

Use collection capabilities for navigation/create availability, record capabilities for row/entry actions, and platform capabilities for platform-level functions such as Apps Playground. Do not infer one from another.

Current role semantics provide an important acceptance matrix: Admin is full administration; Superuser has inspection access to protected administration/platform data and Apps Playground execution but no generic entity mutation; User is scoped to its operational organization; Guest is the restricted baseline. The client should receive those outcomes through capabilities rather than reimplementing the role algorithm.

## Metadata-driven state

If the client implements the ManatOS metadata-driven UI model, preserve canonical ownership:

- modern UIS Entry working values are owned by `#data.current`, with `#data.original` as the baseline;
- field interaction/validation states belong under `#state.fields`, not a second writable record;
- nested surfaces have explicit lifecycle/ownership;
- invocation/defaults have provenance;
- facts are non-persisted observations;
- resources/workspaces own only the state their lifecycle requires;
- expression decisions remain side-effect-free.

A framework adapter may map these concepts into React state, Angular services/signals, a mobile state container or another mechanism, but the semantic contract should remain testable independently of the framework.

## API and authentication topology

The TypeScript UI hosts use Node browser-session and API-bridge boundaries appropriate to their implementations; NG1/EJS1 keep the API Bearer token outside ordinary browser JavaScript. EJS0 maintains its separate established integration. Do not assume a future client can call internal BFF endpoints. Select an authentication topology appropriate to that client and expose new trusted endpoints only through an explicit security design.

## Diagnostics

Generate/propagate a request correlation ID where the client/API contract supports it. A development client may offer an API Traffic view and correlate the request ID with server diagnostics. Direct filesystem discovery of API logs/snapshots is only a convenience of the current co-located web implementation; a remote/mobile client would need a diagnostic service/transport if such inspection is desired.

Client-local diagnostics should inspect the client's own runtime/context rather than pretending to display API CTX as live client state.

## TypeScript client source map

| Workspace | Responsibility |
|---|---|
| `shared.UI` | Semantic surface host, embedded components, List/Entry/Flow runtime, state ownership and lifecycle |
| `shared.UI.NG` | Angular adapter components, templates, DOM events and host integration |
| `shared.UI.EJS` | EJS adapter components, templates and rendering integration |
| `ui.NG1` | Angular application and its Node-hosted browser/API integration |
| `ui.EJS1` | EJS application and its Node-hosted browser/API integration |
| `ui.EJS0` | Separate established EJS implementation and legacy-compatible presentation behavior |

A new TypeScript component should respect this dependency direction. Adapter-specific CSS, DOM and focus handling must not redefine canonical field semantics or authorization. The established EJS0 source is a concrete behavioral reference, not the current shared UIS state model.

## Acceptance checklist for a new client

- API authorization remains authoritative.
- Navigation/actions consume capability projections.
- Unauthorized rows are never obtained by relying on client filtering.
- Canonical metadata is not forked into a private incompatible model.
- UI metadata semantics are preserved if supported.
- Client state has explicit ownership/lifecycle.
- Authentication credentials follow an approved client topology.
- Request IDs remain usable for diagnostic correlation.
- Client-specific implementation details are documented under the client implementation, not promoted into system architecture.

See [Client and UI Architecture](Client-Architecture.md), [API Architecture](../api/API-Architecture.md), [Authentication and Authorization](../security/Authentication-and-Authorization.md), and [Client Contract Catalog](Client-Contracts.md).
