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

Structural moves, child creates and child edits modify the working graph. Compact member editing uses the entity's canonical `quick` UI view; full-entry child editors use the same canonical entity metadata through another presentation. Both are subordinate to the workspace owner and do not independently persist the aggregate. A UI view changes presentation, not graph ownership or persistence.

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

## Create versus edit draft lifetime

The current hierarchy draft store deliberately supports only `create` mode. Create Organization is the normal-closure exception: its unfinished graph can be saved in browser local storage, restored on a later Create Organization visit, and explicitly cleared. The screen discloses that continuation behavior.

Edit Organization has no equivalent normal-navigation browser draft. Leaving an uncommitted edit abandons that working transaction unless the separate abnormal outage-recovery mechanism has captured it because the system became unavailable.

A successful hierarchy Commit clears the Create Organization draft and returns to the owning entity list. `Clear all` clears the working create graph/draft only; it does not delete or modify persisted Principals.

See [Persistence, Commit, Discard and Recovery](Persistence-Commit-and-Recovery.md) for the boundary between normal discard, the Create Organization exception and outage recovery.
