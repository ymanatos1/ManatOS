# Applications

An **Application** has a durable catalogue identity and descriptive metadata, while the complete application-design architecture defines the semantics of a composed business solution. Keeping the two concepts distinct prevents a catalogue row from being mistaken for an already executable model package.

## Current canonical entity

`SysBOApplication` is a platform-owned system entity. Its metadata defines `fullName`, semantic-version `version` (default `0.0.1`), `description`, collection-valued `pictures` and `details` of `richText` type, alongside common SysBO fields. The UI metadata provides a full Entry, a read-only quick view, List variants, image-editing presentation policy and a Play action.

```text
Application catalogue record
├─ identity and name
├─ fullName / version
├─ description / rich details
├─ pictures (resource descriptors)
└─ UI views and related Licenses
       │
       └─ Play navigation / Apps Playground
```

A related License may restrict a customer's entitlement to this Application. That record belongs to the shared licensing domain and is governed by the API's actual authorization policy. A visible License tab does not authorize mutation of the License or the Application.

## Design versus execution

The architecture distinguishes a **design definition** (entities, views, rules, relationships, required capabilities) from a **runtime instance** (state, authenticated users, resources, API operations and persistence). The design can be evaluated in an integrated platform environment and, as an architectural objective, interpreted by an independent compatible host. A Play route is a UI entry point, not proof that an application package compiler or independent host already exists.

The full architectural contracts are in [Application Design and Execution](Application-Design-and-Execution.md); [Application Licensing](Applications-and-Licenses.md) explains the commercial relationship and [Named UI Views](../../metadata/UI-Views.md) the shared presentation mechanism.
