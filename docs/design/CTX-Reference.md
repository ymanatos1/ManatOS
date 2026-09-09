# CTX Reference and Reading Model

CTX should be read as a tree of **owned runtime state**, not as a global variable namespace.

Root context supplies system/runtime facts, entity knowledge, company/platform composition and authenticated-user context. `ctx.ui.level` supplies the active UI surface; another `.level` is its child surface. The deepest level is not automatically the owner of every event: an entry form anchors its own level when it starts so a selector opened beneath it cannot retarget the entry's field writes.

Fields use keyed nodes. `fields.customerId.value` is the authoritative live scalar; `fields.customerId.originalValue` is the baseline; `option/options` decorate enum/reference values; validation and UX state are colocated with the field runtime where applicable. Whole-record entry views are projections.

Collections remain arrays but may also be addressed semantically by a stable member `id` or `key`; UUID-like keys use quoted bracket syntax. Pointer nodes expose lexical contextual values using the same `.value` resolution convention while remaining immutable.

Expressions resolve paths relative to their effective scope and may use traversal functions when a decision genuinely needs another context level or persisted entity traversal. Detached temporary scopes can be evaluated but do not claim a canonical path in the attached CTX tree.

For every public branch/path, owner and lifecycle see [CTX Catalog](../reference/CTX-Catalog.md).
