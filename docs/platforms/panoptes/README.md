# Panoptes — Specialized Application

**Panoptes** is a metadata-defined, specialized surveillance application registered through the platform composition mechanism within the same foundation used for company/system capabilities and protoCRM. Its domain demonstrates how a platform contributes its own subsystem and business entities without redefining the shared entity, security, storage or UI infrastructure.

The platform definition is in `shared/src/platforms/panoptes/platform.ts`, with a `surveillance` subsystem registered under the platform's ownership. Its canonical entities are Guard, Project and Post. Their concrete fields, relationship declarations and UI presentations are defined in shared metadata rather than in unique hand-built application controllers.

## Domain at a glance

The registered `surveillance` subsystem supplies **Projects, Posts and Guards** through canonical metadata under `shared/src/metadata/bo/platforms/panoptes/surveillance/`, with separate UI metadata. These entities use the same generic entry/list, reference, expression, authorization and storage contracts as other business objects.

```text
Panoptes (specialized application represented as platform metadata)
  └── Surveillance subsystem
       ├── Projects
       ├── Posts
       └── Guards
             └── shared metadata → UIS / API / Storage
```

This compact example demonstrates composition only; it is not a user manual or a claim that all surveillance workflows are operational.

See [Platform Model](../Platform-Model.md) and [Metadata-Driven Application Design](../Metadata-Driven-Application-Design.md) for the common architectural contracts.

## Architectural role

Panoptes is an **application domain example**, not the owner of the platform foundation. Users, Principals, licensing, authentication, API authorization and CTX remain shared/company/system concerns. The Panoptes subsystem describes business records and presentation contributions consumed by those services.

Metadata for Guards, Projects and Posts supplies concrete material for demonstrating UIS Lists/Entries, enum-backed fields, relationships and platform-scoped navigation. The platform declaration also includes presentation descriptions and capability-aware navigation items; a declared navigation destination must not be interpreted as evidence that every described operational feature has a complete executable workflow.
