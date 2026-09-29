# ManatOS

ManatOS is a **technology foundation** built around a metadata-driven application platform whose central goal is to make business structure and reusable behavior explicit rather than burying it in individual pages, controllers, or storage implementations. The repository currently uses Node.js and TypeScript, but the architecture distinguishes the ManatOS system contracts from the technologies used by any particular client or host.

The current system combines a foundation-level Company domain—users, principals, organizations, licensing and authentication—with platforms and applications such as **protoCRM**. Metadata-driven entities, CTX, expressions, authorization, storage adapters and diagnostics form reusable infrastructure beneath those domains.

This README is intentionally substantial. It is designed to provide a useful picture of ManatOS even when read alone: what the major subsystems are, why they exist, how they interact, and where to continue for full detail.

## 1. The system in one picture

ManatOS separates **semantic declarations**, **runtime context**, **execution**, **authority**, **persistence**, and **presentation**. A client does not become authoritative merely because it renders an entity, and a storage adapter does not redefine business semantics merely because it has richer native database features.

```text
                         ManatOS
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
       Company          Platforms        Applications
          │                 │                 │
          └──────────── shared system foundation ────────┐
                                                         │
        Metadata ── Entities ── Expressions ── CTX       │
            │          │            │          │          │
            └──────────┴────────────┴──────────┘          │
                            │                             │
                ┌───────────┼───────────┐                 │
                │           │           │                 │
             Clients       API       Diagnostics          │
                │           │           │                 │
                └────── Authorization ──┘                 │
                            │                             │
                         Storage ◄────────────────────────┘
```

The boundaries are deliberate. Metadata describes what an entity means. CTX represents observable semantic runtime state. Expressions make eligible decisions declarative and reactive. The API remains the security and persistence authority. Clients consume the same system contracts without defining them. Storage providers implement the same behavioral guarantees through different native capabilities and strategies. Diagnostics correlate those layers without becoming a second source of business state.

The full system overview is under [`docs/system/`](docs/system/); the subject-oriented documentation index is [`docs/README.md`](docs/README.md).

## 2. Company, platforms and applications

ManatOS uses a composition model rather than treating every business object as belonging to one application. **Company scope** is the foundation-level technical catalog/composition scope currently containing accounts/users, principals, organizations, contact information, licensing and external authentication configuration. The term is a domain/runtime label; it does not describe ManatOS's legal or organizational form. **Platform scope** contains capabilities supplied by a platform. **Application scope** contains applications hosted by or associated with a platform.

The current **protoCRM** platform/application area is therefore not the owner of Users, Principals or Licenses. Those are foundation-level Company-domain capabilities. `Applications`, Apps Playground and future platform/application tooling belong to platform scope. This distinction matters for navigation, licensing, authorization, metadata ownership and future extensibility.

```text
Company
├─ Users / Accounts
├─ Principals and organizations
├─ Contact information
├─ Licenses
└─ External authentication providers

Platforms
└─ protoCRM
   ├─ Applications
   ├─ Apps Playground
   └─ future platform/application capabilities
```

The generic metadata-driven entity infrastructure is reusable by both system entities and future application-defined entities. `SysBO` is a naming/category convention for systemic business objects; it is **not** a synonym for every entity in ManatOS.

See [`docs/company/`](docs/company/) for the technical Company domain and [`docs/platforms/`](docs/platforms/) for platform/application composition and protoCRM.

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

See [`docs/metadata/`](docs/metadata/) for the architecture, model, catalog and extension guidance.

## 4. Entities and business-object infrastructure

An entity is more than a CRUD table. The common entity infrastructure covers list/query surfaces, entry surfaces, canonical fields, relationships, validation, calculated values, selectors, related records, reusable components, actions and hierarchy/workspace behavior.

The architecture deliberately avoids parallel implementations for “special” entities when the underlying behavior is generic. A reference field should use the same reference/option semantics whether it appears on a Principal or License. A text or date entity field should use the common enhanced field component rather than an entity-specific input. A related-record selector should operate from canonical metadata and authorization-aware data rather than page-local assumptions.

Entry state distinguishes the original persisted baseline from the current working value. The canonical current value belongs to CTX; the DOM is a projection and input mechanism, not a second state authority. New-entry defaults, existing values, edits, calculated values and save reconciliation all converge on that model.

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

The detailed entity material is intentionally rich and remains separated into focused documents under [`docs/entities/`](docs/entities/).

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

See [`docs/context/`](docs/context/) for topology, ownership, lifecycle, mutation/events, catalogs and debugging/reference material.

## 6. Expressions and reactivity

Expressions let metadata declare side-effect-free decisions and calculations without embedding those decisions in page-specific imperative code. The expression system includes tokenization/parsing, AST caching, evaluation, function registration, CTX resolution, dependency tracking, provenance and diagnostics.

A central architectural test is:

> If a decision depends only on CTX-observable state and has no side effects, first evaluate whether it belongs as a declarative expression.

If the required state is not yet CTX-observable, the next question is whether exposing it appropriately would produce a safe, reusable declarative design. That decision must still consider ownership, lifecycle, security and whether the state is genuinely semantic rather than private implementation bookkeeping.

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

See [`docs/expressions/`](docs/expressions/) for the language pipeline, functions, dependency model, events and extension guide.

## 7. Client and UI architecture

ManatOS does **not** define “the UI” as the current Express/EJS implementation. The current TypeScript/Express web client is one realization of a portable client contract. Future Angular, React, mobile, desktop or specialized clients should be able to implement the same ManatOS semantics without reproducing Express-specific architecture.

A capable client consumes canonical metadata and API contracts, maintains its own client CTX, projects authorization capabilities, renders lists/entries/selectors/components, evaluates eligible declarative presentation decisions and exposes diagnostics appropriate to that client.

```text
              portable ManatOS client contracts
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
 current Express/EJS   future Angular     mobile/desktop
        │                  │                  │
        └──────── metadata / API / auth / CTX ┘
```

The API remains authoritative for security and persistence. A client may hide a button because a projected capability is false, but hiding the button is not the security boundary. Likewise, a client may maintain rich unsaved state, but it does not redefine canonical entity semantics.

Client surfaces have explicit runtime levels and invocation contracts. The browser uses one recursive `ctx.ui.level` chain and one host authority for the fundamental `page`, `popup`, and `embedded` surface hosts. Entry forms, lists, selectors and quick/full UI views are interaction/presentation kinds layered on those hosts, not competing surface topologies. They communicate through canonical invocation/CTX contracts rather than mutable window callbacks or duplicated hidden state. Components are projections/adapters around CTX-owned semantic state.

The current web implementation is documented because developers need to maintain it, but implementation-specific details are kept subordinate to the portable architecture.

See [`docs/clients/`](docs/clients/) for the client contract, surface model, current implementation and future-client guidance.

## 8. API architecture

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

See [`docs/api/`](docs/api/) for layering, query contracts, commands, capabilities, errors, OpenAPI and API extension guidance.

## 9. Authentication, authorization and capabilities

Authentication establishes the subject; authorization determines what that subject may do. The API is the authority. Clients receive capability projections so they can present the correct experience without reimplementing security policy.

The current role semantics are intentionally distinct:

| Role          | Core meaning                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Admin**     | Full administration/access, subject to explicit safety rules such as preventing self-deletion.                                             |
| **Superuser** | Read-only/inspection access to protected administration/platform data plus Apps Playground execution; not generic administration mutation. |
| **User**      | Operational access scoped to the authenticated user/organization and allowed capabilities.                                                 |
| **Guest**     | Most restricted authenticated role.                                                                                                        |

For example, Superuser can inspect Applications and system configuration where allowed and can execute Apps Playground, but that does not grant generic create/update/delete permission for Applications. Admin retains the full mutation baseline. Users and Superusers can see organization-scoped Principal/License data according to policy; Guests do not gain those collections merely by being authenticated.

Capability projection keeps presentation aligned with authority:

```text
API authorization policy
       │
       ├─ collection capabilities
       ├─ record capabilities
       └─ platform capabilities
                │
                ▼
             client CTX
                │
                ▼
       navigation/actions/UI state
```

Row-level policy is as important as collection access. A non-Admin user list, for example, can be constrained to the authenticated user record; organization data is scoped through the user's linked Principal/root organization.

Authentication also covers local credentials, email verification, sessions and external authentication providers. Secret/credential operations use trusted boundaries and do not expose secret material through ordinary entity reads.

See [`docs/security/`](docs/security/) for authentication flows, authorization policy, capabilities and security development rules.

## 10. Storage architecture

Storage is adapter-based, but the important abstraction is stronger than “different classes implementing CRUD.” ManatOS separates three concerns:

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

The JSON/local adapter remains useful for bootstrap/local operation. Relational providers can exploit transactions, constraints, generated columns, triggers or other native features where safe, but richer native capability must not change canonical ManatOS results.

Persisted calculations illustrate this distinction. A field can declare a canonical calculation in metadata. JSON/InMemory persistence can materialize it in ManatOS code. A relational adapter may translate a safe expression into a generated/computed column or other database mechanism, or use the same application evaluator when translation is not appropriate. **The persisted semantic result is the invariant, not the physical mechanism.**

Storage configuration also separates the currently running datastore from preparation of a prospective target. An administrator can configure/test/prepare another target without silently changing the datastore serving the current API process; activation follows explicit lifecycle/restart semantics.

See [`docs/storage/`](docs/storage/) for families, capabilities, strategies, schema projection, calculations, configuration and adapter development.

## 11. Persisted calculations and semantic schema

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

Persisted calculations cross the Metadata, Expressions, Entities and Storage subjects; the canonical storage treatment is described in [`docs/storage/Data-and-Storage-Architecture.md`](docs/storage/Data-and-Storage-Architecture.md), with expression semantics under [`docs/expressions/`](docs/expressions/).

## 12. Diagnostics and observability

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

See [`docs/diagnostics/`](docs/diagnostics/) for API Traffic, request correlation, Operation Context, API/Storage CTX, snapshots, tools and troubleshooting.

## 13. System configuration and administration

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

See [`docs/system/`](docs/system/) for runtime, administration, configuration, errors and system-wide principles.

## 14. Company domain (technical scope)

The Company domain is the foundation-level business domain shared by platforms. `Company` is a technical catalog/composition scope in the domain model; it does not describe ManatOS itself as a company or legal entity. Users/accounts identify authenticated system users. Principals represent people, organizations and other principal types. Organization relationships form hierarchies. Licenses connect company principals to platform/application entitlement. Reusable contact information—email addresses, telephone numbers and structured addresses—belongs to the company/business-object model rather than to a particular screen.

The User-to-Principal relationship separates authentication identity from the richer business principal model. Organization scoping can therefore resolve a user's linked Principal and root organization, then apply the same authorization semantics to lists and direct record reads.

Licenses are platform-aware and can optionally narrow entitlement to an application. They remain foundation-level Company-domain records even though they refer to platform/application scope. This distinction avoids moving licensing ownership into protoCRM merely because protoCRM currently consumes it.

External authentication provider configuration is likewise company/system-level authentication infrastructure. Provider credentials are protected and verified through trusted operations; normal entity reads do not reveal secret material.

See [`docs/company/`](docs/company/) for Users/Principals, organizations, contacts, licenses and external authentication providers.

## 15. Platforms, applications and protoCRM

A platform contributes capabilities and hosts/organizes applications without redefining the ManatOS foundation. Application definitions can use the shared metadata/entity/CTX/expression/API/storage infrastructure while remaining application-owned rather than systemic.

The current protoCRM area demonstrates the platform/application boundary. `Applications` and Apps Playground are platform concerns. Company Users, Principals and Licenses are not protoCRM entities even when protoCRM navigation or authorization consumes their information.

Future applications should be able to define their own entities and metadata without requiring those entities to use the `SysBO` systemic naming convention. The reusable infrastructure is the **metadata-driven entity framework**; SysBO identifies systemic business objects within that larger model.

Application design therefore composes:

```text
ManatOS foundation
    + platform contribution
    + application metadata/entities
    + client implementation(s)
    + API/storage/security contracts
```

See [`docs/platforms/`](docs/platforms/) for platform/application architecture, design principles, metadata-driven application design and protoCRM.

## 16. Architectural principles and extension model

Several principles recur across ManatOS development:

- **One semantic owner.** Do not keep competing mutable authorities for the same value.
- **Metadata before hardcoding.** Reusable semantics belong in canonical metadata/runtime infrastructure.
- **Declarative when appropriate.** Side-effect-free decisions based on observable state should first be evaluated as expressions.
- **Authority stays authoritative.** Client capability projection improves UX but does not replace API enforcement.
- **Provider-neutral semantics.** Storage capabilities may change physical realization, not business meaning.
- **Portable client contracts.** Current Express/EJS implementation choices do not define ManatOS client architecture.
- **Semantic CTX, private implementation state.** Lifecycle/bookkeeping state belongs in CTX only when it is genuinely part of observable semantic runtime context.
- **Regression contracts for architecture.** Important architectural boundaries are protected by tests, not only prose.

When extending a subsystem, first identify the canonical owner and the reusable contract. A new entity behavior should prompt an audit of common entity infrastructure; a new expression function should use the evaluator capability model; a new storage adapter should implement family/capability/strategy contracts; a new client should implement portable client contracts rather than copy Express internals.

The system-wide principles are expanded in [`docs/system/Architectural-Principles.md`](docs/system/Architectural-Principles.md), and practical extension material is under [`docs/development/`](docs/development/).

## 17. Documentation model

The permanent documentation is **subject-oriented**. Architecture, design, development, usage and reference information about one subsystem live together rather than being scattered into audience-specific top-level trees.

```text
docs/
├─ overview/       orientation, concepts, terminology and system map
├─ system/         whole-system runtime, principles, configuration and administration
├─ context/        CTX architecture, model, lifecycle, events and reference
├─ metadata/       canonical/UI metadata architecture, model and catalogs
├─ entities/       entity model, lists, entries, fields, relationships and components
├─ expressions/    language, evaluator, reactivity, functions and events
├─ clients/        portable client contracts, surfaces and implementations
├─ api/            HTTP/API architecture, contracts and extension
├─ security/       authentication, authorization and capability projection
├─ storage/        adapters, families, capabilities, strategies and schema
├─ diagnostics/    observability, API Traffic, CTX snapshots and troubleshooting
├─ company/        Foundation-level Company business domain
├─ platforms/      platform/application architecture and protoCRM
├─ development/    repository setup, build/test workflow and cross-cutting development
└─ diagrams/       cross-system architecture diagrams
```

Each subject follows progressive depth: its `README.md` gives the subsystem picture and reading map; focused documents provide the complete architecture/design/development/reference detail. This root README deliberately repeats a compressed version of important concepts so it remains useful on its own. That duplication is intentional; competing detailed definitions are not.

[`docs/README.md`](docs/README.md) provides reading routes for different goals.

## 18. Repository and development

The repository is an npm-workspaces monorepo targeting the Node.js version declared by `.nvmrc`. Its main implementation areas are `shared/`, `api/` and `ui/`, with Postman material, scripts and deployment support alongside them. The current web client and API are separate processes; process-local caches/runtime services remain process-local.

This README intentionally does **not** turn repository cloning, dependency installation and command invocation into the main story of ManatOS. Those are important to contributors, but they are development workflow rather than system architecture.

For prerequisites, cloning/setup, repository structure, building/running, testing, verification, coding principles and extension workflow, start at [`docs/development/README.md`](docs/development/README.md).

Local runtime/bootstrap data under `data/` is intentionally Git-ignored. It may exist in a developer working tree without belonging to the repository. Generated verification logs and local ZIP helper utilities are likewise local concerns rather than permanent documentation or source artifacts.

## 19. Where to read next

If you are **new to ManatOS**, continue with [`docs/overview/`](docs/overview/) and [`docs/system/`](docs/system/), then follow the subjects that interest you.

If you are **building an entity**, read [`docs/metadata/`](docs/metadata/), [`docs/entities/`](docs/entities/), [`docs/expressions/`](docs/expressions/) and the relevant storage/security contracts.

If you are **building another client**, start with [`docs/clients/`](docs/clients/), then CTX, metadata, API and security. The Express/EJS implementation is an example, not a template that must be copied.

If you are **working on persistence**, start with [`docs/storage/`](docs/storage/) and follow its links into metadata, calculations and diagnostics.

If you are **diagnosing a request**, start with [`docs/diagnostics/`](docs/diagnostics/) and follow the request identity through API Traffic, API logs, API CTX and Storage CTX.

For the complete subject map and curated reading routes, open **[`docs/README.md`](docs/README.md)**.
