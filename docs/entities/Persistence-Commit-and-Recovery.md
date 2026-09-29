# Persistence, Commit, Discard and Recovery

ManatOS deliberately separates **working UI state**, **browser-local continuation state**, **outage recovery**, and **application persistence**. They solve different problems and must not be treated as interchangeable save mechanisms.

## The four boundaries

| Boundary                     | Meaning                                                               | Authority                                                                                       |
| ---------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Working state                | Values/graphs currently being edited                                  | owning entry/component CTX + private component state                                            |
| Baseline                     | State against which the current transaction is compared               | `fields.<k>.originalValue` for scalar entry fields; component/workspace baseline for aggregates |
| Browser-local draft/recovery | Temporary continuation material that can reconstruct uncommitted work | explicitly enabled browser draft/recovery service                                               |
| Persisted state              | Committed application data                                            | API/service/storage transaction                                                                 |

A browser draft or outage-recovery package is **not persisted business data**. Only a successful Save/Commit through the authoritative API changes application storage.

## Ordinary entry lifecycle

For a normal metadata-driven entry, `fields.<k>.value` is the live scalar authority and `fields.<k>.originalValue` is the baseline. `entry.current` and `entry.original` are read-only record projections over those field nodes.

Dirty state is reversible: returning a current value to its baseline makes that field clean again. The entry's `control.state.dirty` is the aggregate transaction fact and can also include legitimate private contributors such as collection or picture workflows.

Normal closure does **not** persist unsaved business changes. When cancellation protection applies, the user can Save or Discard; Save crosses the API persistence boundary, while Discard abandons the working transaction. A clean close simply disposes the surface. There is no general rule that navigation or closure writes an entry draft for later continuation.

## Aggregate contributors

Some editor state cannot be represented as a scalar canonical field. Components register narrow private contributors that expose aggregate facts such as `dirty`, `valid` and `blocked`. Their private values/drafts remain component-owned and are not copied into semantic CTX merely to compute form state.

An active child editor can therefore block parent persistence without pretending that the child's private draft is already a persisted parent value. The entry exposes the resulting aggregate semantic facts; contributor identities/counts remain runtime bookkeeping.

## Save and baseline promotion

A successful entry Save follows this authority transition:

```text
working canonical values + eligible aggregate payloads
                    |
                    v
             API persistence
                    |
                    v
       authoritative server record
                    |
                    v
fields.<k>.originalValue := persisted value
fields.<k>.value         := persisted value when reconciliation requires it
                    |
                    v
        clean current transaction
```

The server response, not the pre-submit browser snapshot, becomes the new baseline. This matters for persisted calculations, audit fields, normalization and other server-managed values.

Failed validation or persistence does not promote the baseline. The working transaction remains available for correction/retry.

## Create Organization: explicit normal-closure exception

The **Create Organization** hierarchy workspace intentionally differs from ordinary entry closure. Its unfinished working graph can be stored as a browser-local draft and continued later after normal navigation/closure. The UI discloses this behavior.

This exception is narrowly scoped:

- draft storage is supported only when the hierarchy workspace is in `create` mode;
- the browser draft contains the working entries and their original-entry baseline snapshot;
- closing/cancelling Create Organization can save that browser draft instead of deleting the unfinished work;
- reopening Create Organization can restore a compatible saved draft;
- **Commit** persists the hierarchy atomically through the API and then clears the Create Organization browser draft;
- **Clear all** clears the working graph and the saved Create Organization draft without deleting/modifying persisted Principals;
- Edit Organization does **not** get this normal-navigation draft persistence.

Therefore “Keep draft & leave” is a continuation operation, not a Commit and not application persistence.

## Abnormal outage recovery

Outage recovery is a separate system-wide mechanism. When ManatOS detects that the system is unavailable, it first captures recoverable user changes and the restorable UI-level descriptors into a per-user IndexedDB recovery package. Only after that package is durable does it gently close/dispose the unavailable UI.

For ordinary entry surfaces, recovery captures dirty field deltas (plus component-specific recovery material where required). For hierarchy workspaces it captures the working graph and original graph. Recoverable popup descriptors/navigation state can also participate in reconstructing the workspace.

During gentle close, baselines may temporarily be aligned to current values so normal cancellation/disposal machinery cannot destroy the already-captured transaction. That is **recovery bookkeeping only**; it is not a Save and does not alter application storage.

After service/session restoration, ManatOS can offer to recover the saved workspace. Recovery reopens/reconstructs UI and reapplies/verifies captured user changes. The user can also forget the recovery package. This mechanism must not be described as normal navigation draft persistence.

## Ownership rule

A useful diagnostic question is: **which boundary owns this value right now?**

- canonical current field value -> semantic CTX field owner;
- scalar baseline -> `fields.<k>.originalValue`;
- component child draft -> private owning component;
- Create Organization continuation draft -> hierarchy draft store;
- abnormal interruption package -> workspace recovery store;
- committed business data -> API/storage.

Do not move lifecycle/recovery bookkeeping into semantic CTX simply because several UI modules need to coordinate around it. Publish only the semantic facts required by expressions/components/debugging, and keep implementation state private.
