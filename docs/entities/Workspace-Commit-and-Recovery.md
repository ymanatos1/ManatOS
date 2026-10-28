# Workspace Commit, Drafts and Recovery

A complex Entry may contain a parent record, related records and pending binary resources that a user edits as one logical workspace. The working representation is not automatically persisted every time a field changes. The system must distinguish **local draft state** from **authoritative committed state**, and must coordinate multi-record changes deliberately.

## The commit boundary

The current API exposes a workspace commit route in `api/src/http/routes/workspace-commit-router.ts`. It validates a commit plan and its operations, receives pending resources separately from record field values, and routes work through authorized executor/collection adapters. That endpoint is a distinct orchestration boundary; it must not be confused with a component's optimistic editing UI.

```text
UIS Entry / related records
       │ working values, baseline, dirty status
       ▼
 Workspace change plan + pending resources
       │ client request (never authoritative)
       ▼
 API validation + authorization + commit orchestration
       │ storage transaction / resource strategy
       ▼
 Authoritative result + identity reconciliation
       ▼
 UIS baseline and working-state reconciliation
```

A new unsaved related entry may have a temporary identity until the API returns a durable ID. Other local operations referencing that entry must be reconciled against the committed identity before declaring the workspace clean.

## Original, current and change state

An Entry distinguishes its original baseline from current working values. Field changes alter the working projection and the dirty ledger; reverting a field must restore the baseline rather than issue an unrequested server operation. Closing a dirty Entry requires explicit user intent, and a nested popup must respect its child's editing state before the parent is released.

A Change Report can describe the pending differences without itself changing domain values. The report is a presentation of the same semantic state, not an additional mutable copy of the pending operations.

## Binary resources

A picture editor may stage binary data separately from the field's metadata/reference representation. Commit processing must keep the resource ownership explicit; base64 content in an arbitrary CTX label or unvalidated attachment name is not a substitute for an authorized binary resource contract. The API route validates resource keys, sizes and permissible resource forms before executing persistence behavior.

**Do not infer that every current UI editor has completed end-to-end binary persistence solely because the API workspace route exists.** Source-level invocation, resource transport and reconciliation must all be established for the exact client and field type.

## Consistency and failures

For a logical workspace operation, successful completion means the server accepted the operation under its transaction and storage contracts. If an operation fails, the UI must preserve meaningful pending work or report the boundary of what was accepted; the client must not silently mark uncommitted edits clean.

Recovery must be described against *actual provider semantics*. The in-memory/JSON adapter and any relational target definitions do not imply identical durable transaction guarantees, and an adapter declared in the registry may not be runnable.

## Design and verification questions

- Which surface owns the working copy? Which API operation commits it?
- How are creates, updates, deletes and related-record references ordered and authorized?
- How are temporary IDs remapped to committed IDs?
- How are pending pictures and metadata kept consistent?
- What happens on timeout, duplicate submission, partial result, or a dirty-close request?
- When is the baseline updated, and how is the CTX observer notified?

See [Entity Entries](Entity-Entries-Forms-Detail.md), [Relationships](Relationships.md), [Storage Architecture](../storage/Data-and-Storage-Architecture.md), and [API Architecture](../api/API-Architecture.md).
