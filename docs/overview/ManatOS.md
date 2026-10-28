# System Overview

ManatOS is a **TypeScript application foundation** for describing business domains and composing software applications from reusable metadata, semantic runtimes and authoritative API services. Its design places business meaning in canonical entity metadata, interaction semantics in the shared UIS runtime, scoped facts in CTX, pure decisions in expressions, and persistence and access control behind server-owned contracts.

A business application therefore does not need a separate handwritten CRUD stack for every entity, UI technology or database engine. The foundation supplies common behavior, and each application contributes the domain vocabulary, views, rules and use cases that distinguish it.

```text
                    Application foundation
         Metadata · Entities · Expressions · CTX
                 API · Security · Storage
                          │
               shared UIS semantics
                /              \
        Angular adapter      EJS adapter
         (ui.NG1)            (ui.EJS1)
                          │
             Business applications
               protoCRM · Panoptes
```

The TypeScript monorepo comprises eight npm workspaces: `shared`, `api`, `shared.UI`, `shared.UI.NG`, `shared.UI.EJS`, `ui.EJS0`, `ui.NG1` and `ui.EJS1`. The established EJS0 client has a separate implementation, while NG1 and EJS1 use shared UIS semantics. The API is independently authoritative for validation, authorization, business operations and persistence.

The source identifier `Company` denotes a shared *technical business domain*—Users, Person/Organization Principals, contacts, licenses and external identity configuration. It is not a legal or organizational classification of the software project.

**protoCRM** is the multi-application design and execution platform: its model can define application metadata, views and behavior and use the common runtime, with independently hosted applications as a broader architectural realization. **Panoptes** is a small specialized example of domain composition, represented by platform metadata in the present source. The documentation gives protoCRM substantially more design treatment than Panoptes.

For the architecture read [Concepts](Concepts.md) and [System Map](System-Map.md). For subsystem depth use the [Documentation Index](../README.md); for a self-contained technical overview use the [Repository README](../../README.md).
