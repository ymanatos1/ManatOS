# ManatOS Documentation

The documentation is organized **by subject, not by audience**. Architecture, design, development, usage and reference material for one subsystem live together so a reader does not have to search parallel `architecture/`, `design/`, `reference/` and `usage/` trees.

The repository [`README.md`](../README.md) is the self-contained technical overview: it deliberately explains every major subsystem in enough depth to stand alone. This page is the navigation layer for going deeper.

## Subject map

| Subject | What it owns |
| --- | --- |
| [`overview/`](overview/README.md) | ManatOS orientation, concepts, system map, glossary and terminology. |
| [`system/`](system/README.md) | Whole-system architecture/runtime, principles, configuration, administration and hierarchical error reporting. |
| [`context/`](context/README.md) | CTX architecture/model, client/API ownership, mutation/events, catalogs and runtime reference. |
| [`metadata/`](metadata/README.md) | Canonical and client/UI metadata architecture, model, catalogs and extension. |
| [`entities/`](entities/README.md) | Entity model, lists, entries, fields, relationships, components, validation, selectors and hierarchies. |
| [`expressions/`](expressions/README.md) | Expression language/evaluator, AST ownership, functions, dependencies, events and reactivity. |
| [`clients/`](clients/README.md) | UIS semantic framework, surfaces, components, Flow execution, Angular/EJS adapters, navigation and client contracts. |
| [`api/`](api/README.md) | API architecture, entity/query/command contracts, capabilities, errors and OpenAPI. |
| [`security/`](security/README.md) | Authentication, authorization, roles, scoping, capability projection and security guidance. |
| [`storage/`](storage/README.md) | Adapters, families, capabilities, JSON transactions, strategies, schema, calculations and configuration lifecycle. |
| [`diagnostics/`](diagnostics/README.md) | API Traffic, request correlation, logs, API CTX, Storage CTX and troubleshooting. |
| [`company/`](company/README.md) | Users, Principals, organizations, contacts, licenses and external authentication providers. |
| [`platforms/`](platforms/README.md) | Platform/application composition, application design, protoCRM and Panoptes. |
| [`multilingual/`](multilingual/README.md) | Language catalogues, presentation projection, static content translation and localization contracts. |
| [`development/`](development/README.md) | Repository setup, build/run/test workflow, coding principles, extension points and documentation standards. |
| [`diagrams/`](diagrams/README.md) | Cross-system architecture diagrams and combined architecture PDF. |

## Reading routes

### New to ManatOS

Read the root [`README.md`](../README.md), then [`overview/`](overview/README.md) and [`system/`](system/README.md). Continue with [`metadata/`](metadata/README.md), [`context/`](context/README.md) and [`entities/`](entities/README.md) to understand the reusable runtime foundation.

### Building or changing an entity

Start with [`metadata/`](metadata/README.md) and [`entities/`](entities/README.md), then use [`expressions/`](expressions/README.md) for declarative behavior, [`api/`](api/README.md) for authoritative server contracts, [`security/`](security/README.md) for access policy and [`storage/`](storage/README.md) for persistence semantics.

### Building another client

Start with [`clients/`](clients/README.md). Then read [`context/`](context/README.md), [`metadata/`](metadata/README.md), [`api/`](api/README.md) and [`security/`](security/README.md). The Angular/EJS UIs are implementations of the client contract, not the definition of ManatOS UI architecture.

### Extending storage

Read [`storage/`](storage/README.md) first, then the semantic inputs in [`metadata/`](metadata/README.md) and [`entities/`](entities/README.md). Use [`diagnostics/`](diagnostics/README.md) for API/Storage CTX and request-level observability.

### Diagnosing runtime behavior

Start with [`diagnostics/`](diagnostics/README.md), then use [`context/`](context/README.md) to understand CTX ownership/lifecycle and [`api/`](api/README.md) or [`storage/`](storage/README.md) for the layer where the request is executing.

### Working on authentication or authorization

Read [`security/`](security/README.md) and [`api/`](api/README.md), then [`company/`](company/README.md) for user/principal/organization semantics and [`clients/`](clients/README.md) for capability-driven presentation.

### Designing a platform or application

Read [`platforms/`](platforms/README.md) together with [`company/`](company/README.md) so ownership boundaries remain clear. Application-defined entities reuse [`metadata/`](metadata/README.md), [`entities/`](entities/README.md) and the other system contracts without automatically becoming SysBOs.

### Setting up the repository or contributing code

Use [`development/`](development/README.md). Cloning, prerequisites, npm commands, build/run, verification and repository mechanics live there rather than dominating the root project overview.

## Documentation ownership rule

Each fact should have one detailed canonical home. Cross-subsystem documents link to that home rather than creating competing definitions. The root README is the intentional exception: it contains a compressed but substantive explanation of every major subsystem so a reader can understand ManatOS without opening the rest of the tree.

Permanent documentation describes ManatOS, not the history of a documentation exercise. Temporary coverage audits, patch reports, migration-progress notes and delivery summaries are working artifacts and do not belong in `docs/`.

## Documentation contract

Documentation is factual rather than promotional. Architectural qualities should be demonstrated through contracts, examples, invariants, tests and responsibility boundaries rather than unsupported adjectives. Implemented behavior and intended direction must be distinguished explicitly.

Subject folders are canonical ownership boundaries for detailed documentation; they are not audience silos. The same architect, developer, administrator or application designer can enter any subject at the depth appropriate to the task. See [`development/Documentation-Standards.md`](development/Documentation-Standards.md) for the permanent writing/maintenance rules.


## Focused reading routes

- **UIS semantics and component extension:** [UIS architecture](clients/UIS-Architecture.md) → [surface/level ownership](clients/UI-Surfaces-and-Levels.md) → [component contracts](clients/UIS-Component-Contracts.md) → [entity fields](entities/Field-Components-Detail.md).
- **Multi-step operations:** [Flow execution](clients/Flow-Execution.md) → [CTX](context/README.md) → [security](security/README.md).
- **Localized applications:** [multilingual infrastructure](multilingual/README.md) → [translation contracts](multilingual/Translation-and-Content-Contracts.md) → [metadata](metadata/README.md).
- **Platform-defined business application:** [application design](platforms/Metadata-Driven-Application-Design.md) → [Panoptes](platforms/panoptes/README.md) → [named UI Views](metadata/UI-Views.md).
- **Native authentication protocol:** [Native OAuth](security/Native-OAuth.md) → [API authority](api/API-Architecture.md). The TypeScript API protocol is covered; native-client implementations are outside this documentation's scope.


## Core architecture reading path

For a technical evaluation of the multi-application and security model, a focused sequence is: [Root README](../README.md) → [Application Design and Execution](platforms/protocrm/Application-Design-and-Execution.md) → [UIS](clients/UIS-Architecture.md) → [Surface Composition](clients/UIS-Surface-Composition.md) → [Authorization Policy](security/Authorization-Policy-Architecture.md) → [License Entitlements](company/License-Entitlements-and-Rules.md). These are subject-based references rather than competing audience-specific explanations.

Panoptes is included only as a small demonstration of a specialized application. Full implementation details of non-TypeScript native clients are outside this documentation's scope.
