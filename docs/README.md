# ManatOS Documentation

The ManatOS documentation is organized **by subject, not by audience**. Architecture, design, development, usage and reference material for one subsystem live together so a reader does not have to search parallel `architecture/`, `design/`, `reference/` and `usage/` trees.

The repository [`README.md`](../README.md) is the self-contained technical overview: it deliberately explains every major subsystem in enough depth to stand alone. This page is the navigation layer for going deeper.

## Subject map

| Subject | What it owns |
| --- | --- |
| [`overview/`](overview/) | ManatOS orientation, concepts, system map, glossary and terminology. |
| [`system/`](system/) | Whole-system architecture/runtime, principles, configuration, administration and errors. |
| [`context/`](context/) | CTX architecture/model, client/API ownership, mutation/events, catalogs and runtime reference. |
| [`metadata/`](metadata/) | Canonical and client/UI metadata architecture, model, catalogs and extension. |
| [`entities/`](entities/) | Entity model, lists, entries, fields, relationships, components, validation, selectors and hierarchies. |
| [`expressions/`](expressions/) | Expression language/evaluator, AST ownership, functions, dependencies, events and reactivity. |
| [`clients/`](clients/) | Portable client contracts, surfaces, navigation and current/future client implementations. |
| [`api/`](api/) | API architecture, entity/query/command contracts, capabilities, errors and OpenAPI. |
| [`security/`](security/) | Authentication, authorization, roles, scoping, capability projection and security guidance. |
| [`storage/`](storage/) | Adapters, families, capabilities, strategies, schema, calculations and configuration lifecycle. |
| [`diagnostics/`](diagnostics/) | API Traffic, request correlation, logs, API CTX, Storage CTX and troubleshooting. |
| [`company/`](company/) | Users, Principals, organizations, contacts, licenses and external authentication providers. |
| [`platforms/`](platforms/) | Platform/application composition, application design and protoCRM. |
| [`development/`](development/) | Repository setup, build/run/test workflow, coding principles, extension points and documentation standards. |
| [`diagrams/`](diagrams/) | Cross-system architecture diagrams and combined architecture PDF. |

## Reading routes

### New to ManatOS

Read the root [`README.md`](../README.md), then [`overview/`](overview/) and [`system/`](system/). Continue with [`metadata/`](metadata/), [`context/`](context/) and [`entities/`](entities/) to understand the reusable runtime foundation.

### Building or changing an entity

Start with [`metadata/`](metadata/) and [`entities/`](entities/), then use [`expressions/`](expressions/) for declarative behavior, [`api/`](api/) for authoritative server contracts, [`security/`](security/) for access policy and [`storage/`](storage/) for persistence semantics.

### Building another client

Start with [`clients/`](clients/). Then read [`context/`](context/), [`metadata/`](metadata/), [`api/`](api/) and [`security/`](security/). The current Express/EJS web client is one implementation of the client contract, not the definition of ManatOS UI architecture.

### Extending storage

Read [`storage/`](storage/) first, then the semantic inputs in [`metadata/`](metadata/) and [`entities/`](entities/). Use [`diagnostics/`](diagnostics/) for API/Storage CTX and request-level observability.

### Diagnosing runtime behavior

Start with [`diagnostics/`](diagnostics/), then use [`context/`](context/) to understand CTX ownership/lifecycle and [`api/`](api/) or [`storage/`](storage/) for the layer where the request is executing.

### Working on authentication or authorization

Read [`security/`](security/) and [`api/`](api/), then [`company/`](company/) for user/principal/organization semantics and [`clients/`](clients/) for capability-driven presentation.

### Designing a platform or application

Read [`platforms/`](platforms/) together with [`company/`](company/) so ownership boundaries remain clear. Application-defined entities reuse [`metadata/`](metadata/), [`entities/`](entities/) and the other system contracts without automatically becoming SysBOs.

### Setting up the repository or contributing code

Use [`development/`](development/). Cloning, prerequisites, npm commands, build/run, verification and repository mechanics live there rather than dominating the root project overview.

## Documentation ownership rule

Each fact should have one detailed canonical home. Cross-subsystem documents link to that home rather than creating competing definitions. The root README is the intentional exception: it contains a compressed but substantive explanation of every major subsystem so a reader can understand ManatOS without opening the rest of the tree.

Permanent documentation describes ManatOS, not the history of a documentation exercise. Temporary coverage audits, patch reports, migration-progress notes and delivery summaries are working artifacts and do not belong in `docs/`.

## Documentation contract

Documentation is factual rather than promotional. Architectural qualities should be demonstrated through contracts, examples, invariants, tests and responsibility boundaries rather than unsupported adjectives. Implemented behavior and intended direction must be distinguished explicitly.

Subject folders are canonical ownership boundaries for detailed documentation; they are not audience silos. The same architect, developer, administrator or application designer can enter any subject at the depth appropriate to the task. See [`development/Documentation-Standards.md`](development/Documentation-Standards.md) for the permanent writing/maintenance rules.
