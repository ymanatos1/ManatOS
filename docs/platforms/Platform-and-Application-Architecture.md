# Platform and Application Architecture

The foundation supports shared system domains, a platform that designs and hosts multiple applications, and special-purpose applications using the same semantics. These levels differ in **responsibility**, not in whether they have their own copy of the entity, UIS or API infrastructure.

## Composition model

```text
Application foundation
├─ shared domain (technical identifier: Company)
│  └─ Users / Principals / contact / Licenses / providers
├─ protoCRM  (multi-application platform)
│  ├─ Applications catalogue
│  ├─ Apps Playground
│  └─ application definition / design / execution model
└─ Panoptes  (special-purpose application)
   └─ surveillance subsystem: Projects / Posts / Guards
```

**Platform** in the source is a registered metadata/presentation contribution: stable identity, navigation, subsystems and platform-scoped capabilities. **Application** is a business solution described by its own model and execution contract. The current code registers Panoptes as a platform because that is the existing composition mechanism; conceptually it illustrates a single-purpose application rather than another general multi-application design environment.

## Shared domain ownership

Users, Person/Organization Principals, organizational hierarchy, contact information, Licenses and external authentication configuration are system-shared concepts. They retain the technical `Company` metadata scope even when an application consumes them. The project itself is a software foundation, not a Company entity.

A License belongs to a Principal, targets a platform and can optionally narrow scope to an application. An application's UI can display the relation, but does not own the License's record semantics or decide effective authorization. See [License Entitlements](../company/License-Entitlements-and-Rules.md).

## protoCRM as a multi-application platform

The platform's architectural contribution extends beyond its current catalogue entity. A full application model describes domain entities, fields, relationships, expressions, named UI Views, UIS surfaces, flows, security requirements and storage behavior. The common runtime interprets those declarations, allowing integrated design/test/run experiences and, at the architectural level, execution under a compatible independent host.

The current TypeScript implementation supplies the platform definition, `SysBOApplication` metadata, full/quick views, related License presentation and Apps Playground navigation/actions. It does **not** by itself demonstrate a complete metadata design studio, deployable application package or independently operating application host. Those belong to the separately described architectural model, not the claims of the current code.

Read [Application Design and Execution](protocrm/Application-Design-and-Execution.md) for the design/runtime contract and [Application Model](Application-Model.md) for general ownership concepts.

## Panoptes as an example

The specialized surveillance domain contributes Project, Post and Guard metadata. Its significance here is architectural: the subsystem uses the common entities/metadata/API/UIS mechanisms without requiring a second business-object engine. Further domain walkthroughs are deliberately limited; the documentation concentrates on the reusable foundation and multi-application design architecture.

## Authority and runtime boundaries

```text
Application declarations
       │
Canonical model / UI Views
       │
UIS surface + selected adapter ───────► user interaction
       │                                   │
       └──────────── API security ◄─────────┘
                         │
                      storage
```

An application's layout cannot redefine a canonical field, bypass organizational policy, or persist a value by mutating client CTX alone. Navigation is capability-informed presentation, while record operations are individually authorized by the API. A storage adapter changes physical realization, not declared business meaning.

## References

[protoCRM](protocrm/README.md) · [Metadata-driven Application Design](Metadata-Driven-Application-Design.md) · [Company](../company/README.md) · [UIS](../clients/UIS-Architecture.md) · [Authorization](../security/Authorization-Policy-Architecture.md). 
