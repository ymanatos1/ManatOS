# CTX Reference and Reading Model

CTX should be read as a tree of **owned runtime state**, not as a global variable namespace.

Root context supplies system/runtime facts, entity knowledge, company/platform composition and authenticated-user context. `ctx.ui.level` supplies the active UI surface; another `.level` is its child surface. The deepest level is not automatically the owner of every event: an entry form anchors its own level when it starts so a selector opened beneath it cannot retarget the entry's field writes.

Fields use keyed nodes. `fields.customerId.value` is the authoritative live scalar; `fields.customerId.originalValue` is the baseline; `option/options` decorate enum/reference values; validation and UX state are colocated with the field runtime where applicable. Whole-record entry views are projections.

Collections remain arrays but may also be addressed semantically by a stable member `id` or `key`; UUID-like keys use quoted bracket syntax. Pointer nodes expose lexical contextual values using the same `.value` resolution convention while remaining immutable.

Expressions resolve paths relative to their effective scope and may use traversal functions when a decision genuinely needs another context level or persisted entity traversal. Detached temporary scopes can be evaluated but do not claim a canonical path in the attached CTX tree.

For every public branch/path, owner and lifecycle see [CTX Catalog](../reference/CTX-Catalog.md).

## Entity initialization context

Canonical business-object defaults do not depend on a UI surface. During create initialization the evaluator receives a small entity-initialization scope with this semantic shape:

```text
current initialization scope
├─ entityName
└─ entry
   └─ current
```

The CTX root still owns `entities`, so canonical expressions use these aliases:

```text
$entity          -> $.entities.(entityName)
$entity-fields   -> $.entities.(entityName).metadata.fieldDefinition
$entry-current   -> entry.current
```

`entityName` is resolved from the current initialization scope, not from `#level`. API/service creation constructs this semantic scope without inventing a UI level. Browser entry initialization evaluates canonical defaults against the real entry surface/field owner; it does not materialize lifecycle bookkeeping or a second working-record scope in semantic CTX. This keeps canonical create-default expressions portable across UI, API and future storage adapters.

Browser initialization ownership (`pendingOwners`, remote-work tracking, phase/settlement) is private runtime bookkeeping. It is exposed to cooperating UI modules through the namespaced `ManatOS.entryInitialization` runtime capability and DOM lifecycle events, not as semantic CTX nodes or a separate top-level browser global. The final initialized values become the clean baseline only after every initialization owner has completed. The same private lifecycle also owns the entry surface reveal gate: server-rendered entry content starts visually withheld, remains fully present in the DOM for initialization and measurement, and is revealed only after settlement. Hosted entry popups receive a one-way readiness notification from their iframe and keep the hosted content hidden behind popup-owned loading presentation until that same settlement point; no readiness flag is added to semantic CTX.

`$level-entity` and `$level-entity-fields` remain valid UI aliases for presentation expressions whose semantics genuinely belong to a UI level. They are not valid dependencies for canonical BO defaults.
