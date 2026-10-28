# Metadata-Driven Application Design

A metadata-driven application defines its business vocabulary, relationships, calculations and presentation rules in declarations interpreted by common infrastructure. It does not require a separate custom-built controller and form implementation for every entity. The approach is strongest when canonical meaning is explicit and the infrastructure that interprets it has stable responsibility boundaries.

## First define the business model

Identify the relevant platform and subsystem, the entities it owns, the identities by which records are addressed, the fields that describe them and the relationships between them. Declare enum values, defaults, constraints and calculated fields at their canonical owners. A business field's meaning must not vary according to whether a user opens it in a selector, List, Entry, popup or another client.

```text
Platform / subsystem vocabulary
  ├── Canonical entities and fields
  ├── Enum definitions, constraints and calculations
  ├── Relationships, references and integrity
  ├── API/security ownership
  └── Presentation contributions (UI Views, actions, layout)
                      │
          UIS + expressions + CTX
                      │
            Authorized API/storage
```

## Separate semantics from views

Canonical metadata describes what an entity **is**. UI metadata describes how that entity **is encountered** in the interface. Named UI Views compose common presentation settings with list- and entry-specific selections. A compact reference selector should not create a second definition of the selected entity. More on this distinction: [Metadata Model](../metadata/Metadata-Model.md) and [Named UI Views](../metadata/UI-Views.md).

## Design decisions with architectural consequences

**Identity and representation.** A reference stores a stable identity. Human-facing labels, icons and images are presentation projections resolved from the referenced record and its entity metadata. Missing labels need a deterministic fallback rather than assuming every entity has a single `name` field.

**Enums.** Subsystem-owned enums are shared vocabularies. Some fields may declare inline options; the same typed option-field mechanism handles both sources while preserving the canonical selected value.

**Calculations.** Expression-backed values require explicit dependency, evaluation authority, and persistence decisions. A calculated label for display and a persisted derived field are different contracts. The evaluator cannot independently commit or authorize data.

**Relationships.** A reference field's selector and a relationship's delete policy answer different questions. UI selection reuses metadata and authorization; the API remains responsible for integrity and protected mutation.

**Concurrency and drafts.** A user may assemble a parent Entry and related edits locally. Workspace commit must define ordering, temporary identity reconciliation, pending resources and rollback/error semantics. The UI's dirty marker is not proof of durable persistence.

## Compact example: Panoptes

Panoptes contributes a `surveillance` subsystem with Project, Post and Guard entities. A Post Entry can use the same generic fields and reference presentation as any other business object. Named views may adapt its List and selector presentation without changing the underlying Post/Guard definitions. API security applies to the resulting operations independently of navigation visibility. See [Panoptes](panoptes/README.md).

This example illustrates subsystem composition rather than providing a procedural application-building manual. The architecture must remain intelligible even for readers who never inspect Panoptes-specific metadata.

## What an application design must make explicit

| Question | Architectural owner |
|---|---|
| What entities and relationships exist? | Subsystem/entity metadata |
| What is calculated, validated or normalized? | Canonical field metadata and authoritative runtime |
| What may an actor see or change? | API authorization and safe UI capability projection |
| Which List/Entry arrangement is appropriate? | UI metadata and named views |
| Which component owns editing? | UIS surface/component contract |
| How is a change committed? | API transaction and storage semantics |
| How does another language affect the screen? | Multilingual presentation projection |

For full subsystem contracts see [Metadata](../metadata/README.md), [Entities](../entities/README.md), [UIS](../clients/UIS-Architecture.md), [Security](../security/README.md), and [Storage](../storage/README.md).

## Application modelling is wider than a single entity

An application model also needs a *composition boundary*: which subsystems and entities participate, which named views are available, what permissions are necessary to design or operate it, and which runtime services must be supplied by its host. A collection of entity schemas alone does not define a functioning multi-user application.

```text
Application definition
├─ business structure: entities / fields / relationships
├─ behavior: expressions / constraints / workflows
├─ presentation: UI Views / UIS components / navigation
├─ authority: roles / organization / entitlements
└─ realization: API / storage / resources / runtime host
```

The platform that authors applications must remain distinguishable from the application it authors. In protoCRM, the Applications entity and Apps Playground are real platform capabilities; the complete generalized model compiler and independent hosting contract are architectural definitions rather than verified current execution paths. For this separation see [Application Design and Execution](protocrm/Application-Design-and-Execution.md).

### Design authority versus runtime authority

A user permitted to **design** an application need not be entitled to execute it on behalf of a customer, and a user permitted to **run** it should not automatically be allowed to change its canonical model. A license may bound the purchased platform/application capability, while organizational delegation and resource policy narrow each Person's authority. UIS action visibility is never the authoritative permission check.

The complete policy model is documented under [Authorization Policy Architecture](../security/Authorization-Policy-Architecture.md) and [License Entitlements](../company/License-Entitlements-and-Rules.md).
