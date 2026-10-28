# Application Design and Execution

protoCRM is a **multi-application platform** built on the common application foundation. Its defining architectural purpose is to let authorized people describe business applications through metadata, design their presentation and behavior, and test or run them through reusable infrastructure rather than writing an unrelated system for each application.

The platform also has CRM-oriented business vocabulary. That is a domain direction, not a limitation on the generic application-design architecture. An application may use customer relationships, internal operations, surveillance tasks or another domain so long as its semantics fit the supported metadata and runtime contracts.

This document explains the **design model and architectural boundaries**. It does not turn the repository documentation into an Apps Playground user manual.

## 1. The application as a declarative artifact

An application definition is more than a record containing a name. At its full architectural meaning, an application is an organized set of business objects, metadata, UI views, rules, relationships and execution policy that can be interpreted by the common runtime.

```text
                         protoCRM
                application design environment
                             │
              ┌──────────────┴──────────────┐
              │                             │
       Application catalogue          Application design
       identity / version             declarative metadata
              │                             │
              └──────────────┬──────────────┘
                             ▼
                Shared application foundation
            metadata ─ entities ─ expressions ─ CTX
                    │                    │
              API / storage        UIS / clients
                    └────────┬───────────┘
                             ▼
                     Run and test model
```

The catalogue answers *which application is being designed or opened*. Canonical entity/subsystem metadata answers *what its business structures mean*. UI metadata answers *how a person encounters them*. Expressions provide restricted declarative calculations and presentation behavior. UIS hosts semantic surfaces, while the API and storage preserve security and persistence authority.

These responsibilities remain separate even if a designer presents them as a single integrated experience.

## 2. The design vocabulary

| Element | Architectural responsibility | Example |
|---|---|---|
| Application | Identity, ownership and optional versioned boundary of a composed solution | Internal service-management app |
| Platform / subsystem | Named contribution to the available business and presentation vocabulary | Application-defined subsystem |
| Entity | Stable identity and lifecycle of a business object type | Customer, Task, Assignment |
| Field and enum | Typed value semantics, constraints, defaults and option vocabularies | Priority, due date, status |
| Relationship | Connection, cardinality, selection and integrity rules | Assignment belongs to Task |
| Expression | Calculated or conditional declarative value | Derived display/status |
| UI View | Named composition of List/Entry presentation and actions | Main list, quick view, selector |
| Surface and component | Reusable interaction and editing contract | List, Entry, reference field |
| Flow | Stateful coordination of a multi-step operation, separate from UIS level nesting | A guided multi-step workflow |
| Security and license | Actor permission and purchased product entitlement | Design versus run permission |
| Storage | Durable implementation of domain semantics | Persisted records with integrity |

An application designer should select or declare these concepts without taking responsibility for duplicating their technical machinery. This is the principal source of reuse and future multi-client portability.

## 3. One meaning, several representations

An entity's canonical metadata must not be redefined according to where a user sees it. For example, a reference to `Customer` stores identity rather than a copied display string; its visible label can include the target entity's canonical name, type, icon or image when available. The same reference can appear in a List, an Entry, a selector popup or a read-only summary.

A UI View can select fields, layout, grouping, tabs and actions while retaining canonical field type, nullability, reference target and authorization. An editor cannot make an invalid relationship valid merely by hiding its selector restrictions. Business integrity and UI affordances remain separate concerns.

```text
Entity metadata (canonical)
    ├── fields / enums / calculations
    ├── relationships / constraints
    └── identity / representation
              │
              ▼
UI metadata + named views
    ├── List      ├── Entry
    ├── selector  └── quick view
              │
              ▼
UIS semantic host -> rendering adapter
              │
              ▼
API enforcement -> storage
```

## 4. Interaction is part of application design

A designed application must define how users move from discovery to editing and from editing to durable effects. List operations can provide filtering, sorting, selection and pagination; Entry surfaces can compose typed fields, related entries and nested selectors. The surface maintains a working state distinct from the persisted baseline. Flows can coordinate operations beyond one surface.

Not every field requires a hand-coded UI. The common field and component catalog must interpret canonical type semantics with a compatible renderer. Where type-specific behavior has not been fully moved into a reusable semantic component, the actual TypeScript adapter remains the implementation authority. The architectural contract is stronger than the presence of a particular class name.

Application design therefore encompasses *declared intent*, *runtime interaction* and *authoritative execution*, not just screen placement.

## 5. Application lifecycle as an architectural model

The following stages describe distinct system responsibilities, **not a chronological development roadmap**:

```text
Model definition
     │ canonical declarations and references
     ▼
Model validation
     │ metadata integrity / expressions / security constraints
     ▼
UI composition
     │ views / surfaces / reusable components
     ▼
Execution
     │ identity / organization / license / runtime state
     ▼
Persistence
     │ API operations / transactions / resource storage
     ▼
Deployment boundary
       runtime host + application package + configuration
```

A model may be interpreted repeatedly across editing, testing and runtime contexts, but no mode should silently weaken data integrity or authorization. An application package in the architectural sense needs more than visual metadata: it must identify canonical definitions, compatible runtime versions, assets, privileges, dependencies and configuration assumptions.

This document distinguishes the intended full lifecycle from the **current TypeScript implementation**, which provides a platform definition, `SysBOApplication` catalogue entity, Apps Playground navigation and a route/action hook. It does not establish a complete graphical metadata designer, a general persisted application-model compiler, or an independently deployable package/host as operational capabilities.

## 6. The actual application catalogue

`SysBOApplication` currently includes `name`, `fullName`, `version`, `description`, `pictures` and rich-text `details` alongside common SysBO fields. The canonical entity metadata is defined in `shared/src/metadata/bo/platforms/protocrm/applications/bo-applications.ts`; its presentation is declared in the matching `metadata/ui/.../ui-applications.ts`.

The UI definition contains a full entry and quick view, List variants and an action navigating to `/bo/sys-applications/{id}/play`. The platform's navigation also includes `/app-playground`, with visibility conditioned by a server-derived platform-access capability. These are genuine presentation and routing contracts, but a navigation link does not by itself prove that the complete application designer exists behind it.

A License can target the protoCRM platform and, optionally, a single `SysBOApplication`. This relates a commercial entitlement to an application identity without moving licensing ownership into the platform.

## 7. Design-time and runtime authority

The architectural separation is particularly important when the same product both *designs* and *runs* applications:

| Boundary | Design environment | Execution environment |
|---|---|---|
| Metadata | Create/change authorized definitions | Consume validated definitions |
| Capabilities | May require configure/design/publish grants | May require runtime/use grants |
| UIS | Inspect, arrange and test composition | Present ordinary application interactions |
| Data | Authoring examples and permitted test data | Protected operational records |
| API | Authoritative validation and publication | Authoritative operation enforcement |
| Storage | Definition/model persistence | Operational data persistence |

These are design distinctions, not a claim that each is already a separate deployed module. They allow the architecture to describe an integrated designer without conflating a test surface with unrestricted production authority.

## 8. Licensing, multi-tenancy and delegated roles

An organization may acquire rights to use specified applications, with restrictions on number of people, time, product capabilities and organizational distribution. A Person's effective privileges must also respect assigned roles and resource-level policy. A designer might be allowed to configure entities without necessarily administering an organization's users; an operator may use a published application without permission to change its design.

Application ownership, commercial entitlement and business-record ownership are related but distinct. The [License Entitlements and Rules](../../company/License-Entitlements-and-Rules.md) and [Authorization Policy Architecture](../../security/Authorization-Policy-Architecture.md) references define those boundaries more fully.

## 9. How the architecture supports independent applications

One of the central design ambitions is that an application designed inside protoCRM can also be **hosted independently by a compatible runtime**. This should preserve business meaning and policy while allowing different deployment forms:

```text
              Application definition
            model / views / assets / policy
                         │
            ┌────────────┴────────────┐
            │                         │
       Integrated host         Independent host
       inside protoCRM       application + runtime
            │                         │
            └────────────┬────────────┘
                         ▼
             Common semantic contracts
      entities / CTX / expressions / UIS / API
                         │
               storage + authorization
```

Independent hosting is an **architectural vision**, not a currently verified packaging/deployment facility. The central design constraint is that host-specific navigation, page state and credentials must not be serialized as an application's canonical business model. A runtime host must supply only the capabilities it actually supports and must enforce the same trusted API/authorization rules.

An application should declare its runtime dependencies explicitly. Its metadata may be portable; its external integrations, secrets and access control are not automatically transferable across hosts without corresponding configuration and authorization.

## 10. Technical quality of an application model

A serious application definition should be reviewed for:

- **Coherence:** entity identity, field types and relationships do not conflict across views.
- **Determinism:** defaults, calculated values and enum option sources have stable semantics.
- **Security:** no presentation-layer decision is treated as API permission; cross-organization boundaries are respected.
- **Portability:** code-free declarations do not hide undocumented framework-specific assumptions.
- **Testability:** the model admits focused validation, expression, API and UI behavior tests.
- **Compatibility:** model/runtime versions and dependency changes have an explicit interpretation.
- **Operational behavior:** data persistence, concurrency, diagnostics and error handling are well-defined.

These are architectural evaluation criteria, not an assertion that a full application-package validator is already implemented.

## 11. A compact illustrative example

A service-management application could define `Customer`, `Request` and `Assignment`, a `Priority` enum and the `Request -> Customer` relationship. Its principal List might filter open requests; an Entry could compose status, assignee and a related-customer selector. A restricted expression could derive a display status. The API would still authorize each record operation, while UIS provides the same semantic editing behavior irrespective of Angular/EJS presentation.

This example is deliberately conceptual. It shows *how the common foundation composes a business application*, not a claim that those particular entities are shipped in the repository or a step-by-step user tutorial.

## Related references

[Purpose and Scope](Purpose-and-Scope.md) · [Applications](Applications.md) · [Applications and Licenses](Applications-and-Licenses.md) · [Platform/Application Architecture](../Platform-and-Application-Architecture.md) · [Metadata-Driven Application Design](../Metadata-Driven-Application-Design.md) · [UIS Architecture](../../clients/UIS-Architecture.md) · [Named UI Views](../../metadata/UI-Views.md).
