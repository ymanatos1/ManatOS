# CTX Reference and Reading Model

CTX should be read as a tree of **owned runtime state**, not as a global variable namespace.

The modern client root contains `system`, `company`, and `runtime` (effective `subsystems`, `entities`, `enums`, `user`), with optional `flow` and `ui` branches. The API and established EJS0 client use different roots. `$entities`, `$enums` and `$user` are aliases into the modern `$runtime` branch, not duplicate root-owned objects. `ctx.ui.level` supplies the active UI surface; another `.level` is its child surface. The deepest level is not automatically the owner of every event: an entry form anchors its own level when it starts so a selector opened beneath it cannot retarget the entry's field writes.

**Entry values are owned by `#data.current`.** The corresponding clean baseline is `#data.original`; `#state.fields` projects per-field validation/presentation while `#state.entry` holds mode, dirty and save-readiness facts. This is the current EJS1/NG1 UIS contract. The EJS0 `fields.customerId.value` model is a distinct older client's convention and must not be promoted to the newer shared runtime's authority.

Collections remain arrays but may also be addressed semantically by a stable member `id` or `key`; UUID-like keys use quoted bracket syntax. Pointer nodes expose lexical contextual values using the same `.value` resolution convention while remaining immutable.

Expressions resolve paths relative to their effective scope and may use traversal functions when a decision genuinely needs another context level or persisted entity traversal. Detached temporary scopes can be evaluated but do not claim a canonical path in the attached CTX tree.

For every public branch/path, owner and lifecycle see [CTX Catalog](CTX-Catalog.md).

## Entity initialization context

Canonical business-object defaults do not depend on a UI surface. During create initialization the evaluator receives a small entity-initialization scope with this semantic shape:

```text
current initialization scope
├─ entityName
└─ entry
   └─ current
```

The effective root owns `runtime.entities` in modern UIS hosts. Canonical create-defaults are evaluated within an authorized initialization scope, which may expose these expression aliases:

```text
$entity          -> effective entity metadata for entityName
$entity-fields   -> field definitions of effective entity metadata
$entry-current   -> entry.current
```

`entityName` is resolved from the current initialization scope, not from `#level`. API/service creation constructs this semantic scope without inventing a UI level. Browser entry initialization evaluates canonical defaults against the real entry surface/field owner; it does not materialize lifecycle bookkeeping or a second working-record scope in semantic CTX. This keeps canonical create-default expressions portable across UI, API and future storage adapters.

Initialization lifecycle bookkeeping is private to the appropriate Entry or UI host. It is not a second semantic record and must not be promoted into canonical CTX. The modern UIS Entry publishes its working record in `#data.current` and derives field state in `#state.fields`; a host may withhold presentation until the required initialization data is ready. EJS0's browser-side readiness and iframe integration use separate established mechanisms whose private APIs are not cross-client CTX contracts.

`$level-entity` and `$level-entity-fields` remain valid UI aliases for presentation expressions whose semantics genuinely belong to a UI level. They are not valid dependencies for canonical BO defaults.

## Readable aliases versus canonical addressing

The viewer can display concise aliases such as `$ui.level`, `$entities`, `$enums` or `$user`, but those labels are not extra writable roots. Runtime-owned values are canonically scoped under `$runtime` where applicable; compatibility aliases and lexical names are resolved by defined infrastructure. Always distinguish an address used to evaluate an expression from a display path used by an inspector.

A UI level exposes the four `#control`, `#state`, `#layout` and `#data` semantic namespaces. A Flow is independently rooted at `ctx.flow`, and its current step is a pointer, not a duplicate step subtree under UI. See [Context Architecture](Context-Architecture.md) and [UI Surfaces](../clients/UI-Surfaces-and-Levels.md).
