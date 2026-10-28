# Domain Model

The platform's present canonical business object is `SysBOApplication`. Its wider design model composes application-defined business objects through existing entity and metadata infrastructure without assuming those objects must become system-owned `SysBO` entities.

```text
Shared identity / licensing domain
    ├─ User ── Person Principal ── Organization hierarchy
    └─ License ─► platformId / optional applicationId
                                 │
protoCRM ─► Application catalogue ◄┘
    │
    └─ Application design (architectural model)
       ├─ domain entities / relationships
       ├─ enums / calculations / rules
       ├─ UI Views / UIS surfaces
       ├─ Flows / commands
       └─ run-time resources and policy
```

## Implemented Application metadata

`shared/src/metadata/bo/platforms/protocrm/applications/bo-applications.ts` defines `name`, `fullName`, `version`, `description`, `pictures` and rich-text `details`, plus common SysBO fields. `shared/src/metadata/ui/platforms/protocrm/applications/ui-applications.ts` defines an ordinary full view, quick view, List presentation and a Play navigation action.

These fields are catalogue and presentation facts. They do not yet constitute a complete stored design document for arbitrary application-defined entities or a serialized executable application package.

## Integration boundaries

The foundation owns generic entity semantics, UIS interaction, CTX, expression capabilities, API operations, authorization and storage. A designed application supplies its **declarations** and any authorized extension capabilities. Customer account, organization, licensing and authentication remain shared-domain facts, not duplicated under each application.

An Application may expose related Licenses as a read-only collection. This is relation presentation and does not change License ownership or entitle the client to perform authorization locally.

See [Application Design and Execution](Application-Design-and-Execution.md), [Applications](Applications.md), and [Canonical Metadata](../../metadata/Metadata-Model.md).
