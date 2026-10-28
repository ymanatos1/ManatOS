# Metadata Model

Metadata is the canonical description of business entities and their reusable behavior. It gives the API, UIS, expression engine and storage layer a common model while keeping presentation choices separate from domain meaning. Metadata is executable input to a controlled runtime, not arbitrary code that a client may evaluate without authority checks.

## Definition layers

```text
Platform / subsystem
       │ owns canonical vocabulary
       ▼
Entity metadata
  ├── key, identities and representation
  ├── fields: type, defaults, constraints, calculations
  ├── relationships and deletion/integrity policy
  └── enum references and other semantic declarations
       │
       ├──► API validation / authorization / storage
       ├──► expression and reference resolution
       └──► UI metadata
              ├── common List / Entry presentation
              ├── named UI Views
              ├── tabs, fields, actions and related lists
              └── runtime presentation expressions
```

`shared/src/metadata/bo/`, `subsystems/`, and `ui/` implement these distinct ownership groups. The shared architecture is generic; `SysBO` names identify systemic entities rather than every platform-owned application entity.

## Canonical fields and values

The canonical field definition identifies the type, constraints, defaults, normalization and optional calculation policy. Static defaults belong here so creation behavior remains consistent when records are created outside a particular UI. Call-site invocation values are inputs to initializing a working Entry, not a second source of truth afterward.

An expression-backed field may be calculated locally for presentation or materially persisted according to the authoritative contract. Dependency information is required to avoid uncontrolled recomputation. Expression functions and entity resolvers operate under supplied capabilities; they do not gain access to protected records merely because metadata references them.

## Enumerations

Subsystem metadata can declare reusable enums that are referenced from field metadata. Some fields also declare inline options. The effective option list should be resolved through one common component contract, never copied into each Entry's mutable state as a second canonical catalogue. Stable enum identities remain independent of language-specific labels.

## Relationships and entry representation

Relationships define record topology, the identity of referenced entities and integrity/delete semantics. UI selectors may assist in choosing an existing reference, but they do not replace relationship authorization or storage constraints.

Canonical entry representation describes what makes a record intelligible beyond its GUID: labels, descriptive fields, state and entity metadata. UI views may add icons, photos or layout, but two List surfaces should not invent incompatible names for the same referenced record. When a canonical label cannot be resolved, a deterministic supported fallback must be used rather than fabricating human-readable content.

## UI metadata and Views

UI metadata (`shared/src/metadata/ui/types.ts`) owns list/record presentation without redefining canonical data semantics. `resolveSysBOUIView` composes common Entry presentation with a named view; `resolveSysBOUIListView` selects a keyed List view; `resolveSysBOUIRelatedCollection` combines reusable related-list views with relationship-level contributions. Unknown selected keys fail rather than silently selecting another view. See [Named UI Views](UI-Views.md) for precedence details.

### Expression-backed presentation rules

Visibility, enabled state, editability, dynamic labels and related presentation facts may depend on current CTX facts. Evaluating them is a **read** of runtime state, not an authorization grant or persistence operation. Reactions should update the affected presentation while preserving the owning Entry's canonical current values.

## Metadata extension and review

A new field or entity should be assessed across five boundaries: canonical declaration, API enforcement, UIS component selection, language presentation and persistence/query semantics. A source-code annotation or type declaration alone does not prove that all clients render the component or that its write path is complete.

Further reading: [Metadata Architecture](Metadata-Architecture.md), [UI Views](UI-Views.md), [Entity Model](../entities/Entity-Model.md), [Expression Architecture](../expressions/Expression-Architecture.md).
