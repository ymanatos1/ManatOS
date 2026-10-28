# ManatOS

ManatOS is a metadata-driven application foundation and software architecture whose central goal is to make business structure and reusable behavior explicit rather than burying it in individual pages, controllers, or storage implementations. The repository currently uses Node.js and TypeScript, but the architecture distinguishes the shared system contracts from the technologies used by any particular client or host.

The system combines a shared **Company domain model**—users, principals, organizations and licensing—with the **protoCRM** multi-application platform and specialized-purpose applications such as **Panoptes**. *Company* is the internal name of a technical domain, not the identity or legal status of the software project. Metadata, entities, CTX, expressions, UIS, authorization, storage and diagnostics provide the common foundation.

This README is a substantive architectural introduction: the major subsystems, their responsibilities, their interactions, and the references that develop each subject in depth.

## 1. The system in one picture

The foundation distinguishes **declarations**, **runtime state**, **execution**, **authority**, **persistence** and **presentation**. An application derives behavior from canonical metadata instead of reimplementing equivalent business meaning in independent screens, controllers and database adapters.

```text
                       Application foundation
                              │
                  Shared business/identity domain
                  Users · Principals · Licenses
                              │
            ┌─────────────────┴──────────────────┐
            │                                    │
      protoCRM platform                 Specialized application
      many designed apps                    e.g. Panoptes
            │                                    │
            └─────────────────┬──────────────────┘
                              ▼
                  Canonical metadata / Entities
                           │
                  Expressions ── CTX
                           │
              ┌────────────┴────────────┐
              │                         │
          UIS clients              Authoritative API
         Angular / EJS             security / operations
              │                         │
              └────────────┬────────────┘
                           ▼
                   Storage + diagnostics
```

This sketch is **conceptual**, not a declaration that every depicted deployment or designer capability is operational. The TypeScript system implements a shared metadata/entity/CTX/expression foundation, the API, Angular/EJS clients and the semantic UIS framework. protoCRM supplies Application records and Playground entry points; fully declarative application design and independently hosted application packages belong to the larger architectural model.

Each layer retains a distinct responsibility. A client cannot authorize an operation merely by showing a button, a License does not replace user/record policy, and a storage adapter cannot redefine canonical entity meaning. The architectural overview is under [System](docs/system/README.md); the detailed subject map is [Documentation](docs/README.md).

The active JSON storage adapter combines process-local snapshot/restore semantics with temporary-file replacement; explicit multi-request transactions instead use a compensation journal and carry different isolation guarantees. API failures preserve optional nested semantic operation traces, exposed under a configurable error-detail policy and displayed by the shared UIS error surface when supplied. See [JSON Transaction Semantics](docs/storage/InMemory-JSON-Transactions.md) and [Hierarchical Error Model](docs/system/Error-Model.md) for their authoritative contracts.

## 2. Shared domain, platforms and applications

The `Company` domain in source code supplies shared identities and commercial relationships. A **User** authenticates; a **Principal** represents a Person or Organization; **Licenses** relate an entitled Principal to platform/application access. These concerns are reused across applications rather than owned by one platform. `Company` is only the established technical domain identifier.

**protoCRM** is a multi-application platform: it provides an application catalogue and an architectural environment in which applications can be defined, designed, tested and run through the shared foundation. Its broader design model includes metadata-defined entities, relationships, rules, UI Views and execution policies. The present TypeScript code implements the Applications entity, declared views and Apps Playground routes, while an independent application package/runtime remains an architectural vision.

**Panoptes** is a specialized application presented through platform metadata in the current source. Its surveillance subsystem illustrates how one application can contribute its own domain entities without redefining the common infrastructure. Panoptes is an example here, not a second major documentation subject.

```text
Application foundation
├─ Shared technical domain (`Company` in metadata/code)
│  ├─ Users / identities
│  ├─ Person and Organization Principals
│  ├─ Contact information
│  ├─ Licenses and commercial entitlements
│  └─ External authentication configuration
├─ protoCRM  [multi-application platform]
│  ├─ Application catalogue
│  ├─ Apps Playground
│  └─ application design / execution architecture
└─ Panoptes [special-purpose application]
   └─ surveillance: Projects, Posts, Guards
```

The `SysBO` naming convention identifies system-owned business objects; it does not describe every possible application-defined entity. For deeper treatment, see [Identity and Licensing](docs/company/README.md) and [protoCRM Design and Execution](docs/platforms/protocrm/Application-Design-and-Execution.md).

## 3. Metadata-driven architecture

Metadata is an architectural input, not decoration attached after behavior has already been hardcoded. Canonical entity metadata describes fields, types, defaults, normalization, relationships, calculations and other semantics. UI/client metadata adds presentation concerns such as tabs, layout, components and actions without becoming the owner of domain semantics.

A recurring ManatOS rule is: **if behavior is reusable across entities, implement it in common metadata/runtime infrastructure rather than special-casing the current entity**. This is why the same machinery can drive Users, Principals, Applications, Licenses and future entities.

A simplified field declaration illustrates the intent:

```text
fieldDefinition
└─ rootPrincipalId
   ├─ type: reference
   ├─ readonly: true
   └─ calculation
      ├─ expression: TraverseEntity(...)
      └─ persisted: true
```

That one declaration can inform runtime calculation, client representation, persistence behavior, dependency handling and storage schema planning. It avoids separately encoding the meaning of `rootPrincipalId` in a form, API controller and database adapter.

Metadata is also intentionally separated by ownership. Defaults that define a newly created entity belong to canonical entity metadata because they must apply at authoritative creation boundaries, not only when one UI happens to create the record. Presentation-only decisions belong to client/UI metadata.

See [`docs/metadata/`](docs/metadata/README.md) for the architecture, model, catalog and extension guidance.

## 4. Entities and business-object infrastructure

An entity is more than a CRUD table. The common entity infrastructure covers list/query surfaces, entry surfaces, canonical fields, relationships, validation, calculated values, selectors, related records, reusable components, actions and hierarchy/workspace behavior.

The architecture deliberately avoids parallel implementations for “special” entities when the underlying behavior is generic. A reference field should use the same reference/option semantics whether it appears on a Principal or License. A text or date entity field should use the common enhanced field component rather than an entity-specific input. A related-record selector should operate from canonical metadata and authorization-aware data rather than page-local assumptions.

Entry state distinguishes the original persisted baseline from the current working value. The canonical current value belongs to CTX; the DOM is a projection and input mechanism, not a second state authority. New-entry defaults, existing values, edits and calculated values converge on that model. The current shared UIS Entry can submit and reconcile an API-backed **create**; its existing-record editing state does not yet provide an equivalent general Save command, although the API and EJS0 expose separate update capabilities.

Relationships carry semantic meaning too. Integrity, inverse relationships, delete behavior and reference resolution are handled through shared infrastructure. Hierarchy workspaces build on those contracts rather than maintaining an unrelated hierarchy model.

Example:

```text
Principal entry
├─ canonical entity metadata
├─ client metadata
├─ CTX entry.current values
├─ reusable field components
├─ relationship/reference catalogues
└─ actions evaluated against authorization + runtime state
```

The detailed entity material is intentionally rich and remains separated into focused documents under [`docs/entities/`](docs/entities/README.md).

## 5. CTX: the semantic runtime context

**CTX is ManatOS's system-wide observable semantic runtime context model.** It is not merely UI state and it is not merely an expression scope. CTX provides structured, scoped runtime state used by interactive clients, API execution, expressions, reactive dependencies and diagnostics.

Different processes own independent CTX trees according to their responsibilities and lifecycles. A client CTX models interactive surfaces, fields, resources, invocation state and reactive presentation. API CTX models concurrent request execution and nested subsystem work. They use common CTX semantics where appropriate, but they are **not synchronized copies** and neither is subordinate to the other.

A simplified API tree can look like:

```text
$
├─ company
├─ system
├─ entities
└─ api
   ├─ level-request-A
   │  ├─ user
   │  └─ level-storage-A1
   └─ level-request-B
      ├─ user
      └─ level-storage-B1
```

Each API request receives its own branch. Nested major operations can create child levels, while lexical traversal lets deeper work resolve appropriate ancestor/request context. Parallel requests therefore do not require a dangerous process-global “current request” variable.

On an interactive client, CTX similarly gives a surface a semantic home for current entry values, resources, state and dependencies. When a field changes, the canonical CTX value changes first; reactive dependants can then recalculate and presentation components synchronize from that authority.

Expressions are **consumers of CTX**. Saying that CTX exists “for expression evaluation” would be too narrow: API execution and client runtime state are first-class CTX uses in their own right.

See [`docs/context/`](docs/context/README.md) for topology, ownership, lifecycle, mutation/events, catalogs and debugging/reference material.

## 6. Expressions and reactivity

Expressions let metadata declare side-effect-free decisions and calculations without embedding those decisions in page-specific imperative code. The expression system includes tokenization/parsing, AST caching, evaluation, function registration, CTX resolution, dependency tracking, provenance and diagnostics.

A central architectural test is:

> If a decision depends only on CTX-observable state and has no side effects, first evaluate whether it belongs as a declarative expression.

If the required state is not yet CTX-observable, the next question is whether exposing it appropriately would produce a safe, reusable declarative design. That decision must still consider ownership, lifecycle, security and whether the state is genuinely semantic rather than private implementation bookkeeping.

The implemented language includes mandatory and optional (`?.`) path traversal, nullish fallback (`??`), conditional selection (`? :`) and strict array membership (`IN`). Optional traversal tolerates missing/null receivers without making every path segment optional. These rules matter when expressions access nested CTX scope and dynamic metadata; the [language reference](docs/expressions/Expressions.md) defines their exact grammar and error behavior.

Expression ASTs are process-local. The API process has its own global lazy AST cache/registry and a client process/runtime has its own appropriate cache. Source is parsed once on first use in that process and the AST is reused there; ASTs are not transferred between API and client as invocation state.

Example:

```text
metadata expression
      │
      ▼
process-local AST registry
      │
      ▼
evaluate against CTX + explicit capabilities
      │
      ├─ result
      ├─ dependencies
      └─ diagnostic provenance
```

Functions such as entity traversal are explicit evaluator capabilities rather than hidden access to arbitrary services. This keeps the expression language reusable while preserving execution boundaries.

See [`docs/expressions/`](docs/expressions/README.md) for the language pipeline, functions, dependency model, events and extension guide.

## 7. Client and UI architecture

The UI is not defined by any single Express/EJS or Angular rendering implementation. The TypeScript repository implements a common semantic UIS runtime and distinct Angular and EJS presentation adapters. Those implementations demonstrate how rendering can vary without redefining shared metadata, CTX, security or persistence contracts. The same separation also provides a basis for additional technologies such as .NET and Kotlin Multiplatform, without implying that their internal implementations or behavioral parity are specified here.

A capable client consumes canonical metadata and API contracts, maintains its own client CTX, projects authorization capabilities, renders lists/entries/selectors/components, evaluates eligible declarative presentation decisions and exposes diagnostics appropriate to that client.

```text
                    shared semantic contracts
             metadata · CTX · expressions · API
                              │
                     shared.UI / UIS
             surfaces · components · Flows
                     ┌────────┴────────┐
                     │                 │
              shared.UI.NG       shared.UI.EJS
                     │                 │
                   NG1                EJS1
       (EJS0 is a separate established UI implementation)
```

The API remains authoritative for security and persistence. A client may hide a button because a projected capability is false, but hiding the button is not the security boundary. Likewise, a client may maintain rich unsaved state, but it does not redefine canonical entity semantics.

Client surfaces have explicit runtime levels and invocation contracts. Entry forms, list pages, selectors, popups and embedded/hosted surfaces should communicate through canonical contracts rather than mutable window callbacks or duplicated hidden state. Components are projections/adapters around CTX-owned semantic state.

The TypeScript implementations are documented as concrete realizations of the contracts, while framework-specific DOM and host details remain subordinate to the portable semantic architecture.

See [`docs/clients/`](docs/clients/README.md) for the client contract, UIS, surfaces, components, Flow execution and current Angular/EJS adapters.

## 8. UIS: shared UI semantic infrastructure

**UIS separates interactive application meaning from presentation technology.** Its shared runtime models Pages, Lists, Entries, typed fields, nested popups and embedded components. The Angular and EJS adapters turn these semantic contracts into distinct browser presentations. A browser event requests an action; the owning component and runtime determine its state implications; the API remains authoritative for protected mutations.

The fundamental UI surface is not a DOM node or route name. It is an owned runtime level beneath `ctx.ui.level`, with ordered `#control`, `#state`, `#layout` and `#data` namespaces. A nested popup adds a child `.level`, preserving the caller's context and semantic ownership. The host publishes a complete level before observers see it and prevents stale asynchronous disposal from removing a different surface owner.

```text
Canonical metadata / CTX / API
               │
         shared.UI runtime
     UiSurfaceHostRuntime
               │
  ┌────────────┼──────────────┐
  │            │              │
 Page/List    Entry        Popup / embedded
  │            │              │
  └────────────┴──────────────┘
               │ semantic layout, actions and state
         ┌─────┴──────┐
     Angular adapter   EJS adapter
          │                │
         NG1              EJS1
```

For typed fields, shared behavior addresses formatting, interpretation and field-state rules, while concrete embedded components own their layout contribution and interactions. A generic host should compose rather than replicate type-specific logic. Runtime implementation and adapter coverage must be assessed per component: a registered field type is not by itself evidence of complete behavior in every client.

Operations spanning more than one interaction can use a **Flow**, whose steps belong under `ctx.flow` rather than the UI level tree. A Flow may open surfaces and respond to events but does not take over surface ownership or API authorization. This separation is critical to authentication and other conditional, asynchronous interactions.

Detailed references: [UIS Architecture](docs/clients/UIS-Architecture.md), [Surface Composition](docs/clients/UIS-Surface-Composition.md), [Surfaces and Levels](docs/clients/UI-Surfaces-and-Levels.md), [Component Contracts](docs/clients/UIS-Component-Contracts.md) and [Flow Execution](docs/clients/Flow-Execution.md).

## 9. Multilingual infrastructure

The multilingual subsystem provides **language-independent business meaning with localized presentation**. Canonical record identities, metadata keys, enum values, access policy and API facts remain stable when a reader changes language. Human-facing names, messages, captions and static content are resolved at presentation boundaries; translated text is not written back into authoritative business metadata or entry values.

The TypeScript implementation supports English (`en`) and Greek (`el`) identifiers, five shared text dictionary groups (`CO`, `PL`, `SS`, `EN`, `CM`), `@GROUP.key` references and inline multilingual descriptions. Components can use keyed text resolution and named parameters, while full static HTML follows a separate content translation path. Angular and EJS share translation semantics but differ in how live presentation is refreshed.

```text
Domain and metadata (language-neutral)
               │
     catalogue / text references
               │
   language selection + resolution
               │
 UI and content presentation projection
               │
  English / Greek text in the host
```

Language switching should change presentation, not constitute an Entry edit, trigger persistence or modify authorization. Dictionary availability is distinct from guaranteed completeness of all translated content. Translation output must also be escaped for its target HTML or attribute context.

See [Multilingual Infrastructure](docs/multilingual/README.md), [Translation Contracts](docs/multilingual/Translation-and-Content-Contracts.md) and [UIS Architecture](docs/clients/UIS-Architecture.md).

## 10. API architecture

The API is the authoritative server boundary for domain mutation, persistence, authorization and trusted commands. It exposes generic entity behavior where semantics are generic and explicit command endpoints where an operation has meaning beyond ordinary CRUD.

The generic entity API supports metadata, list/query operations, record operations and common response/error semantics. Query contracts are designed so filtering/authorization can reach the storage boundary rather than requiring a client to fetch everything and filter afterward. Reference catalogues and capability projections provide clients with authorized information needed to render reusable interfaces.

```text
client request
    │
    ▼
HTTP / authentication
    │
    ▼
authorization + request/API CTX
    │
    ▼
entity/service or explicit command
    │
    ▼
storage abstraction
    │
    ▼
response envelope + diagnostics correlation
```

The API is storage-neutral at its business/service layers. It asks for system semantics; the selected storage adapter determines how those semantics are physically realized. It also owns request correlation so one request can be followed through structured logs, API CTX and nested storage diagnostics.

OpenAPI describes the public HTTP surface, while internal trusted operations remain separate from ordinary public CRUD where exposing them would weaken security or semantic boundaries.

See [`docs/api/`](docs/api/README.md) for layering, query contracts, commands, capabilities, errors, OpenAPI and API extension guidance.

## 11. Authentication, authorization and licensing

**Authentication establishes identity; authorization decides whether that identity may perform a specific operation.** The API makes the decision, while clients use safe capability projections to guide presentation. Roles alone are not a sufficient account of the full policy architecture: organizational membership, delegated authority, record relationships, license entitlements and resource restrictions are different inputs.

```text
Authenticated SysUser ── Person Principal
          │                    │
       role policy       Organization Principal
          │                    │
          │           purchased License entitlements
          │                    │
          └──────────┬─────────┘
                     ▼
             Resource authorization
          entity · operation · record
                     │
              authoritative API
               ├─ enforce request
               └─ project capabilities → UIS
```

The current TypeScript API implements four roles (`Guest`, `User`, `Superuser`, `Admin`), centralized entity/record `read/create/update/delete` decisions and scoped Principal/License reads. `Admin` provides normal administration with explicit safety exceptions. `Superuser` supports additional inspection and platform use without generic entity mutation; account self-service remains separately governed. Other roles depend on entity/record relationships. The service also uses audit-field relationships for some non-administrative edits; these must not be mistaken for a fully general ownership/delegation engine.

A License currently binds a Principal to exactly one platform and optionally one application, with status, validity, quantity and textual `rules`. The broader policy model allows an organization's purchased privileges to be distributed to eligible Person Principals under delegated roles, seat restrictions and resource permissions. **The current license `rules` text is not an API-enforced policy language**, and platform capability projection is presently role-derived. Architectural entitlement semantics and actual executable enforcement must therefore remain distinguishable.

Collection access does not authorize every row; permission filtering, direct read, updates, commands and eventual binary persistence require coherent API checks. Presentation state can be stale and cannot override a failed API decision. Browser sessions, API bearer sessions, OAuth callbacks and trusted-provider credentials also have distinct owners and security boundaries.

See [Authorization Policy Architecture](docs/security/Authorization-Policy-Architecture.md), [License Entitlements](docs/company/License-Entitlements-and-Rules.md), [Authentication and Authorization](docs/security/Authentication-and-Authorization.md) and [Security Architecture](docs/security/Security-Architecture.md).

## 12. Storage architecture

Storage is adapter-based, but the important abstraction is stronger than “different classes implementing CRUD.” The design separates three concerns:

1. **System behavioral guarantees** — semantics ManatOS requires regardless of provider.
2. **Effective native capabilities** — features supplied by an adapter and inherited through its adapter-family hierarchy.
3. **Implementation strategies** — how an adapter satisfies each guarantee using native support or a defined fallback.

This prevents business/service code from accumulating checks such as `if adapterId === 'postgres'`. Provider-specific physical choices belong to adapter strategy.

Relational adapters are grouped by deployment model:

```text
Relational
├─ Server RDBMS
│  ├─ SQL Server
│  ├─ MariaDB
│  └─ PostgreSQL
└─ Embedded RDBMS
   └─ SQLite
```

The operational InMemory/JSON adapter supplies the current reference persistence behavior. SQLite, SQL Server, MariaDB and PostgreSQL appear in provider/capability definitions; registration does **not** mean each is an operational production backend. Relational implementations may exploit transactions, constraints, generated columns, triggers or other native features where safe, but richer native capability must not change canonical ManatOS results.

Persisted calculations illustrate this distinction. A field can declare a canonical calculation in metadata. JSON/InMemory persistence can materialize it in ManatOS code. A relational adapter may translate a safe expression into a generated/computed column or other database mechanism, or use the same application evaluator when translation is not appropriate. **The persisted semantic result is the invariant, not the physical mechanism.**

Storage configuration also separates the currently running datastore from preparation of a prospective target. An administrator can configure/test/prepare another target without silently changing the datastore serving the current API process; activation follows explicit lifecycle/restart semantics.

See [`docs/storage/`](docs/storage/README.md) for families, capabilities, strategies, schema projection, calculations, configuration and adapter development.

## 13. Persisted calculations and semantic schema

Calculated fields are canonical typed fields with a value source; they are not a separate parallel species of UI field. Some calculations are transient, while metadata can mark a calculation as persisted when its value must be stored and participate in authoritative data behavior.

Current examples include Principal name derivation, Principal root hierarchy calculation, telephone full-number formatting and address formatted-description materialization. The same pattern is reusable by future entities.

```text
canonical field metadata
   calculation.expression
   calculation.persisted = true
             │
             ▼
 authoritative persistence boundary
             │
       ┌─────┴─────┐
       │           │
 application    safe native
 evaluator      DB mechanism
       │           │
       └──── same stored semantic value ────┘
```

For hierarchy calculations, changing one record can affect descendants. The persistence architecture therefore cannot assume every calculated value depends only on the row being directly saved; dependency/cascade behavior belongs to the canonical calculation semantics.

Relational desired-schema planning carries semantic information such as uniqueness, references and persisted calculations forward to physical planning. That allows a future adapter to choose appropriate database-native structures without making the metadata provider-specific.

Persisted calculations cross the Metadata, Expressions, Entities and Storage subjects; the canonical storage treatment is described in [`docs/storage/Data-and-Storage-Architecture.md`](docs/storage/Data-and-Storage-Architecture.md), with expression semantics under [`docs/expressions/`](docs/expressions/README.md).

## 14. Diagnostics and observability

ManatOS diagnostics are designed to make a problem traceable across layers rather than presenting unrelated console fragments. A request identity correlates client API Traffic, server request processing, structured API logs, API CTX and nested Storage CTX snapshots.

```text
Client action
    │
    ▼
API Traffic ── requestId R42
    │
    ▼
API request / Operation Context
    │
    ├─ structured API log entries [R42]
    ├─ API CTX snapshot
    └─ Storage CTX snapshot(s)
```

The client-side developer dock includes CTX-oriented inspection and API Traffic. API Traffic records the current client's outgoing calls and can expose correlated diagnostic tabs when the development topology can access the relevant local diagnostic files.

API CTX snapshots are captured from the request subtree before that subtree is disposed. Storage operations can create nested diagnostic levels, allowing the storage portion of a request to be inspected without inventing a second unrelated storage logging framework. Snapshot serialization centrally redacts secrets/tokens/credentials and handles non-JSON-friendly runtime values safely.

Diagnostics are observational: they must not become hidden business state or change runtime semantics merely to make the debugger convenient. Development-only local filesystem integrations are also distinguished from portable production diagnostics.

See [`docs/diagnostics/`](docs/diagnostics/README.md) for API Traffic, request correlation, Operation Context, API/Storage CTX, snapshots, tools and troubleshooting.

## 15. System configuration and administration

System configuration contains runtime/administrative settings whose ownership is broader than an individual entity form. Configuration includes areas such as storage selection/preparation and diagnostic settings. Sensitive values are handled through trusted server-side mechanisms rather than being exposed as ordinary readable configuration values.

Storage settings demonstrate the lifecycle distinction between **configured**, **selected for next start**, and **currently running** state. The running adapter/configuration is fixed for the process lifetime; changing the selected configuration does not pretend the current process has already switched providers.

Administration surfaces are capability-aware. Admin can perform the permitted mutations; Superuser receives inspection/read-only behavior where policy allows. The API still enforces those distinctions independently of what controls a client renders.

The system area also documents global error semantics, runtime architecture and architectural principles. It is the right place for behavior that cuts across multiple business subjects but is not itself CTX, metadata, storage, security or diagnostics.

Example:

```text
System settings
├─ current/running state        (process reality)
├─ selected configuration      (next-start intent)
├─ prospective preparation     (administrative workflow)
└─ authorization capabilities  (who may inspect/change it)
```

See [`docs/system/`](docs/system/README.md) for runtime, administration, configuration, errors and system-wide principles.

## 16. Company domain

The **Company domain** is a technical business model shared by platforms, not an organization or legal entity identified with this project. Users/accounts identify authenticated system users. Principals represent people, organizations and other principal types. Organization relationships form hierarchies. Licenses connect company principals to platform/application entitlement. Reusable contact information—email addresses, telephone numbers and structured addresses—belongs to the company/business-object model rather than to a particular screen.

The User-to-Principal relationship separates authentication identity from the richer business principal model. Organization scoping can therefore resolve a user's linked Principal and root organization, then apply the same authorization semantics to lists and direct record reads.

Licenses are platform-aware and can optionally narrow entitlement to an application. They remain company-owned records even though they refer to platform/application scope. This distinction avoids moving licensing ownership into protoCRM merely because protoCRM currently consumes it.

External authentication provider configuration is likewise company/system-level authentication infrastructure. Provider credentials are protected and verified through trusted operations; normal entity reads do not reveal secret material.

See [`docs/company/`](docs/company/README.md) for Users/Principals, organizations, contacts, licenses and external authentication providers.

## 17. Platforms, applications and protoCRM

The principal application-design capability belongs to **protoCRM**, a platform intended to compose and operate multiple metadata-driven business applications. The design environment and the applications it defines are distinct concepts: the environment supplies modelling, testing and composition capabilities, while each application's declarations specify its own entities, relationships, views, rules and execution requirements.

```text
                   protoCRM
          application design + catalogue
                      │
         application metadata package
             │               │
          domain model     UI model
          entities        views/actions
          relationships   surfaces/flows
             └───────┬───────┘
                     ▼
            shared application runtime
      metadata / CTX / expressions / UIS
                     │
             API / policy / storage
                     │
        integrated runtime representation
                     │
      compatible independent-host model
          (architectural capability)
```

In the existing TypeScript implementation, protoCRM contributes its platform definition, the `SysBOApplication` catalogue entity, UI Views and navigation/Playground entry points. These are real facilities, but they do not establish a complete general-purpose graphical designer or a standalone application-hosting system.

The broader design permits an application authored inside the platform to be packaged for execution under a compatible independent host, provided that host supplies the required runtime semantics, resources, configuration and authoritative security. Metadata portability is not equivalent to automatic transfer of credentials, tenant membership or license authority. A designed application can require distinct privileges to configure, test, publish or simply use it.

Panoptes is a compact example of a specialized application represented through platform metadata, with Projects, Posts and Guards owned by its surveillance subsystem. It is not the reference design for the multi-application platform.

See [Application Design and Execution](docs/platforms/protocrm/Application-Design-and-Execution.md), [Application Model](docs/platforms/Application-Model.md), [Metadata-driven Application Design](docs/platforms/Metadata-Driven-Application-Design.md) and [Platform Architecture](docs/platforms/Platform-and-Application-Architecture.md).

## 18. Architectural principles and extension model

Several principles recur throughout the architecture:

- **One semantic owner.** Do not keep competing mutable authorities for the same value.
- **Metadata before hardcoding.** Reusable semantics belong in canonical metadata/runtime infrastructure.
- **Declarative when appropriate.** Side-effect-free decisions based on observable state should first be evaluated as expressions.
- **Authority stays authoritative.** Client capability projection improves UX but does not replace API enforcement.
- **Provider-neutral semantics.** Storage capabilities may change physical realization, not business meaning.
- **Portable client contracts.** Current Express/EJS implementation choices do not define ManatOS client architecture.
- **Semantic CTX, private implementation state.** Lifecycle/bookkeeping state belongs in CTX only when it is genuinely part of observable semantic runtime context.
- **Regression contracts for architecture.** Important architectural boundaries are protected by tests, not only prose.

When extending a subsystem, first identify the canonical owner and the reusable contract. A new entity behavior should prompt an audit of common entity infrastructure; a new expression function should use the evaluator capability model; a new storage adapter should implement family/capability/strategy contracts; a new client should implement portable client contracts rather than copy Express internals.

The system-wide principles are expanded in [`docs/system/Architectural-Principles.md`](docs/system/Architectural-Principles.md), and practical extension material is under [`docs/development/`](docs/development/README.md).

## 19. Documentation model

The permanent documentation is **subject-oriented**. Architecture, design, development, usage and reference information about one subsystem live together rather than being scattered into audience-specific top-level trees.

```text
docs/
├─ overview/       orientation, concepts, terminology and system map
├─ system/         whole-system runtime, principles, configuration and administration
├─ context/        CTX architecture, model, lifecycle, events and reference
├─ metadata/       canonical/UI metadata architecture, model and catalogs
├─ entities/       entity model, lists, entries, fields, relationships and components
├─ expressions/    language, evaluator, reactivity, functions and events
├─ clients/        UIS, surfaces, components, Flows and client adapters
├─ api/            HTTP/API architecture, contracts and extension
├─ security/       authentication, authorization and capability projection
├─ storage/        adapters, families, capabilities, strategies and schema
├─ diagnostics/    observability, API Traffic, CTX snapshots and troubleshooting
├─ company/        Company metadata domain: users, principals and licensing
├─ platforms/      platform architecture, protoCRM and Panoptes
├─ multilingual/   language resources, localization and presentation boundaries
├─ development/    repository setup, build/test workflow and cross-cutting development
└─ diagrams/       cross-system architecture diagrams
```

Each subject follows progressive depth: its `README.md` gives the subsystem picture and reading map; focused documents provide the complete architecture/design/development/reference detail. This root README deliberately repeats a compressed version of important concepts so it remains useful on its own. That duplication is intentional; competing detailed definitions are not.

[`docs/README.md`](docs/README.md) provides reading routes for different goals.

## 20. Repository and development

The repository is an npm-workspaces monorepo targeting the Node.js version declared by `.nvmrc`. Its primary workspaces are `shared`, `shared.UI`, `shared.UI.NG`, `shared.UI.EJS`, `api`, `ui.EJS0`, `ui.NG1` and `ui.EJS1`, with scripts, test infrastructure and deployment support alongside them. The API and UI hosts are separate processes; process-local caches/runtime services remain process-local.

This README intentionally does **not** turn repository cloning, dependency installation and command invocation into the main story of ManatOS. Those are important to contributors, but they are development workflow rather than system architecture.

For prerequisites, cloning/setup, repository structure, building/running, testing, verification, coding principles and extension workflow, start at [`docs/development/README.md`](docs/development/README.md).

Local runtime/bootstrap data under `data/` is intentionally Git-ignored. It may exist in a developer working tree without belonging to the repository. Generated verification logs and local ZIP helper utilities are likewise local concerns rather than permanent documentation or source artifacts.

## 21. Where to read next

If you are **new to ManatOS**, continue with [`docs/overview/`](docs/overview/README.md) and [`docs/system/`](docs/system/README.md), then follow the subjects that interest you.

If you are **building an entity**, read [`docs/metadata/`](docs/metadata/README.md), [`docs/entities/`](docs/entities/README.md), [`docs/expressions/`](docs/expressions/README.md) and the relevant storage/security contracts.

If you are **working with UIS or another rendering technology**, start with [`docs/clients/`](docs/clients/README.md), then CTX, metadata, API and security. The Angular and EJS adapters illustrate the shared semantic contracts; a client should not reproduce the internals of another adapter.

If you are **working on persistence**, start with [`docs/storage/`](docs/storage/README.md) and follow its links into metadata, calculations and diagnostics.

If you are **diagnosing a request**, start with [`docs/diagnostics/`](docs/diagnostics/README.md) and follow the request identity through API Traffic, API logs, API CTX and Storage CTX.

For the complete subject map and curated reading routes, open **[`docs/README.md`](docs/README.md)**.
