# System Map

The architecture separates canonical business declarations, semantic execution, authoritative operations, presentation and persistence. This separation permits multiple clients to interpret the same metadata without making a browser component, database engine or application-specific screen the owner of business meaning.

## Logical system

```text
                        Application foundation
                                 │
         ┌───────────────────────┴────────────────────────┐
         │                                                │
 Shared identity/licensing                            Platforms/apps
 Users · Principals · Organizations                   protoCRM · Panoptes
         │                                                │
         └───────────────────────┬────────────────────────┘
                                 ▼
                         Shared contracts
                Metadata · Entities · Expressions
                        CTX · Multilingual
                                 │
           ┌─────────────────────┴──────────────────────┐
           │                                            │
       Semantic UIS                                Authoritative API
      surfaces, fields                             auth, CRUD, storage
      lists, entries, flows                        capabilities, policy
           │                                            │
     ┌─────┴─────┐                                      ▼
     ▼           ▼                                Storage boundary
   Angular      EJS                              adapter + transaction
```

This is the conceptual relationship, not a claim that every envisioned application designer, relational provider or license-entitlement rule executes today. The shared source has active concrete implementations in the TypeScript workspaces described below.

## Actual TypeScript workspace composition

```text
shared ───────────────────────────────► api
   │                                     ▲
   └─► shared.UI                            │ HTTP
           ├─► shared.UI.NG  ─► ui.NG1 ─────┤
           └─► shared.UI.EJS ─► ui.EJS1 ────┤
                     ui.EJS0 ───────────────┘
```

`ui.EJS0` is a distinct established EJS client using the common API. `ui.NG1` and `ui.EJS1` are separate hosts consuming UIS through their respective adapters. The semantic core does not contain Angular-specific or EJS-specific authorization rules. For details see [Repository Structure](../development/Repository-Structure.md).

## Request and interaction boundaries

1. **Canonical declarations:** metadata declares entities, fields, relationships, enums, view choices and calculations.
2. **Client composition:** a host resolves page/list/entry/popup content, creates its owned CTX level and projects semantic layout through an adapter.
3. **Expression execution:** the interpreter evaluates declared expressions using the host's scoped facts and permitted capabilities; reactive changes propagate through observers.
4. **Authoritative request:** a client requests an operation from the API; the server authenticates the subject, checks resource/record authorization and executes storage operations.
5. **Response and reconciliation:** the client incorporates the authorized result into its working state, maintaining baseline/dirty and ownership rules.

API CTX and UI CTX are separate host-owned runtime trees. Authentication sessions, UIS state, transactions and diagnostics have distinct ownership and lifetime. This distinction is crucial when interpreting runtime behavior.

## Applications and reusable capabilities

**protoCRM** is the multi-application platform and application-design environment. Its architecture encompasses declarative design, in-foundation testing/execution and a possible independently hosted runtime model. **Panoptes** is a specialized domain application represented through the platform metadata structure in the TypeScript repository. The technical `Company` scope contains shared Person/Organization principals, users and licenses; it is not a description of the project itself.

## Follow the subject boundaries

- [System Architecture](../system/System-Architecture.md) — complete responsibility model.
- [Metadata Architecture](../metadata/Metadata-Architecture.md) — canonical declarations and views.
- [CTX](../context/Context-Architecture.md) and [Expressions](../expressions/Expression-Architecture.md) — semantic execution.
- [UIS](../clients/UIS-Architecture.md) and [Surfaces](../clients/UI-Surfaces-and-Levels.md) — client composition.
- [Security](../security/Security-Architecture.md) and [Authorization](../security/Authorization-Policy-Architecture.md) — trust and permission boundaries.
- [Storage](../storage/Data-and-Storage-Architecture.md) — adapter and transaction contracts.
