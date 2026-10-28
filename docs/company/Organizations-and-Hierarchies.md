# Organizations and Hierarchies

Organization hierarchy is shared-domain data built from Principal relationships; it is not owned by protoCRM.

Principal parent relationships form the organization structure. The hierarchy is domain data rather than a drawing-specific structure: Tree and Chart views are two presentations of the same working graph.

## Parent and root semantics

A Principal can reference a parent Principal according to the applicable business restrictions. Root Principal is derived by traversing the parent chain rather than maintained as an unrelated user-entered value. Traversal that reaches records outside the current UI list uses resolver-backed evaluation/domain capability instead of assuming every ancestor is already loaded in the browser.

## Workspace transaction

The Organization tab uses a hierarchy workspace with its own draft graph. Add, relate, remove and reorganize operations update that working graph until Commit persists the hierarchy changes.

```text
Persisted organization
        |
        v
Hierarchy workspace draft
  ├── add existing/new principal
  ├── relate / move / remove
  └── Tree or Chart presentation
        |
        +-- Commit --> persistence
        +-- Cancel  --> discard draft
```

Because this is an aggregate transaction, workspace dirtiness can exist independently of scalar field dirtiness. It therefore contributes to the owning entry/surface aggregate state rather than pretending every change is a single `fields.<key>.value` mutation.

## Organizational scope versus record ownership

The root Principal identifies the organization's canonical hierarchy boundary. That is useful for finding related Persons and records, but two questions remain separate: **does the record belong to the organization?** and **which Person may perform this operation?** A broad `rootId` match should not be interpreted as unrestricted mutation by every descendant.

```text
Organization root
├─ Department A
│  ├─ Person 1 ─ User 1
│  └─ Person 2 ─ User 2
└─ Department B
   └─ Person 3 ─ User 3
           │
   License belongs to root
           │
   Person-specific delegation
           │
   record- and operation-specific check
```

A record may carry creator/editor audit fields without having an explicit ownership identity. Audit provenance is not equivalent to durable organizational ownership. The current API uses matching `createdBy` or `updatedBy` as a fallback for some generic mutations; a complete policy needs verified ownership and delegation facts to express more precise permissions.

An organizational move changes membership and potentially applicable Licenses. That change must be evaluated at the API, not inferred from the current browser Tree/Chart. See [Authorization Policy Architecture](../security/Authorization-Policy-Architecture.md) and [License Entitlements](License-Entitlements-and-Rules.md).
