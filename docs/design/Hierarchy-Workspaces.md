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
## Runtime responsibility split

The browser hierarchy implementation keeps one semantic working graph in CTX while separating implementation responsibilities:

- the workspace orchestrator owns CTX mutation, quick editing, aggregate dirty/valid state, draft/clear/commit flow and event wiring;
- the hierarchy model owns presentation-neutral root/completion/comparison calculations;
- the draft store owns browser-local draft-key persistence and compatible-key recovery;
- the relationship runtime owns generic relationship eligibility, cycle-safe placement/removal, persisted-candidate overlay and original-row snapshot maintenance.

These services do not create independent graph authorities. Relationship and model operations consume the workspace-owned entries and write through the workspace CTX mutation boundary. Browser draft persistence is recovery/workspace infrastructure rather than application persistence.
