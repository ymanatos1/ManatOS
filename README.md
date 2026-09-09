# ManatOS

ManatOS is a metadata-driven application foundation for building business systems whose domain model, user interface, runtime state, declarative rules, security boundaries, and persistence behavior are described through explicit contracts rather than scattered page-specific implementation.

The repository contains the reusable foundation and **protoCRM**, the first concrete platform built on it. protoCRM currently exercises the foundation through system/business objects such as Users, Principals, Applications, Licenses, contact information, external authentication providers, organization hierarchies, and related administration capabilities.

This README is intentionally more than a project index. It gives a reasonably complete high-level picture of the system for readers who may not continue into the detailed documentation, while linking every major subject to the deeper material.

## What problem the system is addressing

Business applications repeatedly need the same classes of behavior: entities and relationships, list and entry screens, selectors, validation, calculated values, permissions, authentication, persistence, navigation, configuration, application composition, and diagnostics. A conventional implementation can easily express those concerns several times: once in domain code, again in API handlers, again in page code, and again in client-side conditions.

The system instead tries to make the reusable semantics explicit and give each kind of information an identifiable owner. The resulting design is based on several separations:

- **canonical business-object metadata** describes what an entity is independently of a particular screen;
- **UI metadata** describes how UI-capable clients compose lists, entries, tabs, fields, actions, components, and presentation around those entities;
- **CTX** represents observable runtime state and the active recursive UI topology;
- **expressions** represent side-effect-free calculations and decisions over observable state;
- **server policies and capabilities** keep authorization authoritative at the API boundary while allowing the UI to present permitted operations correctly;
- **storage contracts** separate business/query semantics from a particular datastore implementation;
- **platform and application composition** lets product-specific capabilities reuse the same foundation instead of copying the runtime.

The objective is not to remove application code. It is to move repeatable structure and decisions into explicit, inspectable contracts and reusable runtime mechanisms, leaving imperative code for behavior that actually requires it.

## The system at a glance

The repository is a TypeScript workspace with three principal packages:

```text
ManatOS
|
+-- shared
|   +-- domain and context contracts
|   +-- canonical business-object metadata
|   +-- UI metadata contracts
|   +-- policies
|   +-- expression language/runtime semantics
|   +-- platform definitions
|
+-- api
|   +-- HTTP/API boundary
|   +-- authentication and authorization
|   +-- protected commands and business operations
|   +-- metadata/query endpoints
|   +-- storage abstraction and adapters
|   +-- audit, email, configuration and security services
|
+-- ui
    +-- server-side UI host
    +-- metadata-driven list and entry rendering
    +-- browser CTX/runtime
    +-- field and compound components
    +-- selectors and popups
    +-- expression-driven reactive behavior
    +-- developer/debugging tools
```

A simplified responsibility flow is:

```text
                         shared contracts
                metadata / policies / expressions
                           /           \
                          /             \
                         v               v
                    API boundary      UI metadata
                 authorization            |
                 persistence              v
                 commands/queries    UI composition
                         |                 |
                         +-------> facts/capabilities
                                           |
                                           v
                                     CTX runtime
                                           |
                              expressions + events
                                           |
                                           v
                                  interactive UI
```

The **API owns business truth and security-sensitive decisions**. The **UI owns interactive presentation state**. Shared contracts give both sides a common semantic vocabulary without making either process a duplicate implementation of the other.

## Metadata-driven business objects

A **SysBO (System Business Object)** is an entity known to the generic infrastructure through canonical metadata. Metadata can describe fields, relationships, calculations, persistence-relevant semantics, and other entity contracts. The entity's stable metadata identity is separate from the identifier of an individual stored record.

UI metadata is deliberately separate from canonical entity metadata. It can describe list columns and filters, entry tabs, field presentation, components, actions, selectors, dynamic visibility/editability, and other interaction concerns without making those details part of the business object's canonical definition.

That separation matters because the same business object can participate in API operations, relationships, calculations, background logic, or future clients without requiring those consumers to understand an EJS page or browser component.

## CTX: observable runtime context

The UI runtime exposes its relevant observable state through **CTX**. At a high level:

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
            +-- level
                +-- ...
```

The recursive `ctx.ui.level` chain represents active UI nesting. A list can open an entry; an entry can open a selector or popup; that child can itself own another child level. This is one topology rather than separate special-case context models for every UI kind.

CTX is not simply a bag of browser variables. Ownership and mutation semantics are part of the model. For an entry scalar field, for example, `fields.<field>.value` is the live value authority and `originalValue` is its baseline. Whole-record `entry.current` and `entry.original` views are projections/mirrors rather than competing writable copies. This makes mutation, dirtiness, event publication, dependency invalidation, and debugging refer to the same state authority.

Compound editors can own aggregate transactional state beyond individual scalar fields. A hierarchy workspace, for example, may coordinate a working graph and commit it as one operation. The design therefore distinguishes field-level state from aggregate transaction ownership rather than pretending every edit is one scalar assignment.

## Declarative expressions and reactivity

The shared foundation includes an expression language for side-effect-free calculations and decisions. Expressions can drive calculated values and UI behavior such as visibility, editability, action state, presentation state, and structured predicates.

A central design rule is:

> If a decision depends only on CTX-observable state and has no side effects, first evaluate whether it belongs as a declarative expression.

This does not mean every decision must become metadata. It means repeatable observable decisions should not automatically disappear into page-specific JavaScript when they can be represented, inspected, reused, dependency-tracked, and tested as data plus a common evaluation contract.

Dependencies connect expressions to observable changes. CTX mutations therefore have a causal model: one logical change should have one authoritative mutation path, one corresponding event story, and deterministic invalidation/recalculation of affected derived state.

## UI composition

The UI is server-hosted and browser-interactive. Its metadata-driven infrastructure includes reusable mechanisms for:

- entity lists, columns, filtering, paging and actions;
- entity entry forms and tab composition;
- scalar field components and richer field presentation;
- calculated, readonly and dynamically constrained fields;
- record selectors;
- child popups and nested UI levels;
- related collections;
- hierarchy/tree/chart workspaces;
- entry save/delete lifecycle and aggregate dirty state;
- metadata-driven actions and capability-aware presentation.

The important architectural point is that these mechanisms are intended to be **generic infrastructure**. Entity-specific behavior should live in metadata, shared domain semantics, expressions, or explicit reusable components when those mechanisms can represent it safely. A new entity should not require a parallel private UI framework.

## Relationships and data integrity

Relationships are part of canonical business semantics rather than merely visual links between screens. Metadata can describe relationships, inverse endpoints, and deletion/retention behavior. This allows generic infrastructure and business operations to reason about linked records consistently.

The same principle applies to queries. Structured filters and exception predicates are intended to remain structured through the API/storage boundary so a capable storage adapter can eventually translate them into native datastore predicates instead of requiring the browser to fetch data and filter it after selection.

## Security, authentication, and capabilities

Security boundaries are intentionally asymmetric: the browser may know whether an operation should be shown or enabled, but it is never the authority that permits the operation.

The API owns authentication, authorization, protected commands, credential handling, and capability decisions. The UI consumes safe projected facts/capabilities to present the correct interaction. Sensitive material is kept behind trusted server-side boundaries rather than being exposed as ordinary SysBO data.

The current system includes local account/session behavior, external authentication-provider configuration and identities, role/capability policy, protected administrative operations, and encrypted secret handling. UI metadata and CTX can react to safe authorization facts without duplicating the authorization policy itself.

## Company, platforms, applications, and protoCRM

The system has an explicit composition model above individual entities:

```text
Company
  |
  +-- company-wide capabilities and entities
  |
  +-- Platforms
        |
        +-- Applications
        +-- platform navigation
        +-- platform entity contributions
        +-- platform-specific behavior
```

The current company catalog is **ManatOS Software Solutions**. **protoCRM** is the current concrete platform. The model is multi-platform even though only one platform is presently configured.

Applications are platform-level business capabilities, not separate copies of the core runtime. Licensing and platform/application access can therefore participate in the same company/platform/application model.

protoCRM is important to the repository for two reasons: it is useful application functionality in its own right, and it provides a concrete environment in which the reusable foundation abstractions are exercised. Its Users, Principals, Applications, Licenses, contact structures, organizations and administration features expose where generic platform mechanisms end and application/domain semantics begin.

## Persistence and storage

Persistence sits behind storage contracts rather than being allowed to define the rest of the architecture. Business and query semantics should remain meaningful before a particular storage technology is chosen.

The current implementation provides storage abstractions and concrete development/runtime support, while the contracts are designed so future adapters can perform more work natively—for example translating structured query predicates to an RDBMS `WHERE` clause rather than materializing an entire dataset first.

This is also why UI-only filtering is not treated as a substitute for query semantics when a predicate belongs to record selection itself.

## Developer observability

The repository includes integrated developer tooling because a metadata-driven/reactive runtime becomes difficult to reason about if its effective state is invisible.

The Developer Tools provide a **CTX Viewer** and **API Traffic** inspection. The CTX tooling can navigate the recursive context tree, inspect targeted paths, maintain multiple views/tabs, inspect properties, and follow runtime state while normal UI interaction continues. The tools can also detach into a secondary window while retaining the same live runtime rather than creating a duplicate application context.

Developer-tool workspace preferences such as layout and selected inspection state are distinct from application runtime data. The former may persist for developer convenience; CTX values and API traffic are live runtime information rather than persisted application state.

The debugger is therefore not intended merely as a cosmetic developer panel. It is part of making metadata, ownership, expression scope, nested UI levels, and reactive state inspectable while developing the system.

## Engineering principles

Several principles recur across the codebase:

1. **One semantic owner.** A value or decision should have an identifiable authority; mirrors and projections must not quietly become second writers.
2. **Metadata before entity-specific infrastructure.** If behavior is structurally reusable, represent it through generic metadata/runtime contracts rather than hardcoding one entity's page.
3. **Declarative decisions where appropriate.** Observable, side-effect-free decisions are candidates for expressions.
4. **Server authorization remains authoritative.** UI state improves interaction but cannot grant permission.
5. **Structured semantics survive boundaries.** Expressions, relationships, predicates, and capabilities should not be reduced to ad-hoc strings or browser-only conventions when downstream layers need their meaning.
6. **Events follow mutation authority.** One logical mutation should not be independently reproduced by several writers and event sources.
7. **Runtime ownership follows lifecycle.** Pages, child UI levels, components, fields, and workspaces own and dispose the state that belongs to them.
8. **Concrete platforms exercise the foundation.** Reusable architecture is validated through real application behavior rather than maintained only as abstract framework code.
9. **Diagnostics should expose the model.** CTX, API activity, expression scope, and state ownership should be inspectable rather than inferred from incidental DOM behavior.
10. **Tests protect architectural contracts.** The test suite covers not only business outcomes but also important presentation, metadata, runtime, security, and responsibility boundaries.

These are design constraints rather than claims that every possible business application can or should be expressed declaratively.

## Repository structure

At the top level:

```text
api/        API process, security/business services, HTTP routes and storage
shared/     shared contracts, metadata, policies, expressions and domain model
ui/         UI host, browser runtime, metadata presentation and developer tools
docs/       system, architecture, design, development, application and usage documentation
postman/    API collections/environment material
scripts/    repository verification/support scripts
```

The source trees are organized by architectural responsibility. Tests are similarly grouped by areas such as integration, metadata, runtime, security, presentation, SysBO behavior and architecture contracts rather than being kept as one flat test directory.

## Verification and development workflow

The repository provides a root verification workflow:

```text
npm run verify
```

It performs linting, formatting checks, TypeScript builds and the workspace test suites. The companion development workflow can verify first and then start the shared compiler watcher plus the API and UI development processes.

The test suite deliberately includes several kinds of checks: unit/domain behavior, API integration, authorization, metadata contracts, UI presentation contracts, runtime semantics, expression behavior, component boundaries, and architecture-level invariants. This makes structural regressions visible even when a particular screen might still appear to work manually.

See [Development](docs/development/README.md) and [Testing](docs/development/Testing.md) for the detailed workflow.

## Current scope and intended direction

The project is an actively developed system rather than a finished general-purpose commercial framework. Documentation distinguishes implemented behavior from intended design direction.

The current implementation already exercises the architecture through protoCRM and the system-administration domain. The longer-term direction is to make the same metadata, context, expression, security, storage, platform, and UI composition foundations support broader business applications without turning the foundation into a collection of application-specific exceptions.

Future storage engines, additional platforms/applications, richer metadata capabilities, and additional reusable components should therefore extend existing contracts where appropriate rather than bypassing them with parallel mechanisms.

## Documentation

The documentation is designed for different reading purposes and is intentionally cross-linked. You do **not** need to read it in source-tree order.

| If you want to understand...                                          | Start here                                       |
| --------------------------------------------------------------------- | ------------------------------------------------ |
| the vocabulary and core mental model                                  | [Concepts](docs/Concepts.md)                     |
| the whole system and major boundaries                                 | [System Map](docs/System-Map.md)                 |
| architectural responsibilities and invariants                         | [Architecture](docs/architecture/README.md)      |
| exact runtime, CTX, metadata and UI semantics                         | [Design](docs/design/README.md)                  |
| how to work safely in the repository                                  | [Development](docs/development/README.md)        |
| how applications/platforms are designed on the foundation             | [Application Design](docs/apps-design/README.md) |
| protoCRM as a concrete platform                                       | [protoCRM](docs/apps-design/protocrm/README.md)  |
| how to use and administer the system                                  | [Usage](docs/usage/README.md)                    |
| exact catalogs of CTX, metadata, events, entities and other contracts | [Reference](docs/reference/README.md)            |
| all documentation and audience-oriented paths                         | [Documentation Home](docs/README.md)             |

The documentation aims to make the system understandable **before source inspection is necessary**. The source code remains authoritative for executable behavior; the documentation explains the model, contracts, invariants, ownership rules, rationale, examples, and intended direction that make that behavior coherent.

## A short reading path

If you have only another 15–30 minutes after this README, a useful sequence is:

1. [Concepts](docs/Concepts.md) — learn the vocabulary.
2. [System Map](docs/System-Map.md) — connect the runtime pieces.
3. [Architecture](docs/architecture/README.md) — understand the major boundaries and why they exist.
4. [CTX and Design](docs/design/README.md) — see how runtime state, metadata and UI semantics fit together.
5. [protoCRM](docs/apps-design/protocrm/README.md) — see the foundation applied to a concrete platform.

For a complete index, use the [Documentation Map](docs/Documentation-Map.md).
