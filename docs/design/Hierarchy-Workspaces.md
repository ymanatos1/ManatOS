# Hierarchy Workspaces

A hierarchy workspace is an owner-managed transactional graph editor.

## State

```text
workspace
+-- baseline graph
+-- working graph
+-- selection / view state
+-- component resources
+-- aggregate dirty/valid state
```

Baseline and working graphs intentionally coexist because they represent different semantic states.

## Editing

Structural moves, child creates and child edits modify the working graph. Quick edit and full-entry child editors are subordinate to the workspace owner; they do not independently persist the aggregate.

## Commit

```text
working graph
     |
     | Commit
     v
entries + original entries
     |
     v
aggregate API
     |
     v
single datastore transaction
```

Temporary client identities are resolved at the aggregate boundary. A successful commit promotes the persisted result to the new baseline. Failure preserves the working state so the user can correct or retry.

## Resources

Hierarchy visualizations expose component-owned read models through the surface `resources` channel rather than introducing hierarchy-specific global CTX topology.
