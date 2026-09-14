# Client Implementation Guide

## Scope

This guide is for contributors implementing or extending a ManatOS client. The current repository client is Node.js/Express + EJS/Bootstrap + browser runtime, but the contracts below are deliberately usable by Angular, React, mobile, desktop or other clients.

## Start from contracts, not templates

A new client should treat these as authoritative inputs:

1. public API and authentication contracts;
2. canonical entity metadata;
3. UI metadata where the client participates in metadata-driven presentation;
4. collection/record/platform capability projections;
5. expression-language semantics where declarative UI rules are supported;
6. entity relationship/default/calculation semantics exposed through the API;
7. diagnostic correlation IDs for calls the client originates.

Do not port EJS templates first and then infer architecture from them. Templates are one implementation of the portable contracts.

## Minimum client responsibilities

A general interactive client needs to authenticate through a supported topology, call the API, handle standard envelopes/errors, consume capability facts, maintain local interaction state, and present server-authorized data. A metadata-driven client additionally needs to interpret UI metadata, represent surface/entry/list state, and evaluate supported declarative expressions consistently.

A client must never use hidden controls, local role checks or local row filtering as the security boundary.

## Capability consumption

Use collection capabilities for navigation/create availability, record capabilities for row/entry actions, and platform capabilities for platform-level functions such as Apps Playground. Do not infer one from another.

Current role semantics provide an important acceptance matrix: Admin is full administration; Superuser has inspection access to protected administration/platform data and Apps Playground execution but no generic entity mutation; User is scoped to its operational organization; Guest is the restricted baseline. The client should receive those outcomes through capabilities rather than reimplementing the role algorithm.

## Metadata-driven state

If the client implements the ManatOS metadata-driven UI model, preserve canonical ownership:

- field live values are the mutable scalar authority;
- original/current records are projections/baselines, not competing stores;
- nested surfaces have explicit lifecycle/ownership;
- invocation/defaults have provenance;
- facts are non-persisted observations;
- resources/workspaces own only the state their lifecycle requires;
- expression decisions remain side-effect-free.

A framework adapter may map these concepts into React state, Angular services/signals, a mobile state container or another mechanism, but the semantic contract should remain testable independently of the framework.

## API and authentication topology

The current web client uses an Express BFF that keeps the API bearer token out of browser JavaScript. Do not assume a future client can call internal BFF endpoints. Select an authentication topology appropriate to that client and expose new trusted endpoints only through an explicit security design.

## Diagnostics

Generate/propagate a request correlation ID where the client/API contract supports it. A development client may offer an API Traffic view and correlate the request ID with server diagnostics. Direct filesystem discovery of API logs/snapshots is only a convenience of the current co-located web implementation; a remote/mobile client would need a diagnostic service/transport if such inspection is desired.

Client-local diagnostics should inspect the client's own runtime/context rather than pretending to display API CTX as live client state.

## Current Express client source map

For work on the existing implementation, the `ui` workspace owns Express routes/middleware, EJS templates, browser runtime assets, sessions, API-client bridging and the built-in developer tools. Implementation guides such as Adding a Component may refer directly to EJS/DOM/Bootstrap because their audience is specifically this implementation.

That source layout is not a requirement for another client.

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
