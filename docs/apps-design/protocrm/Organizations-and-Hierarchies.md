# Organizations and Hierarchies

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
