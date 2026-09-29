# Generic List and Entry Contracts

ManatOS keeps list browsing, single-record editing and selector use on reusable contracts rather than entity-specific route logic. The contracts are related, but they own different state and cross different authority boundaries.

## List contract

The host-neutral `EntityListRuntime` owns one normalized query plus the current loaded page, its original loaded projection, selection, loading state and paging result. Its definition supplies entity identity, id field, columns, selection mode, data source and optional canonical entry projection.

```text
EntityListDefinition
  -> EntityListRuntime
       query
       entries / originalEntries
       selectedIds
       loading
       paging
  -> injected dataSource.load(query)
```

Page and selector presentation can therefore share the same list state machine without coupling that state machine to page chrome, popup chrome or DOM behavior.

### Query semantics

The canonical list query currently contains:

- `page` and `pageSize`;
- optional `search` plus `searchField`;
- optional `sort` and `direction`;
- keyed string `filters`;
- optional compiled `listExceptions` predicate.

The browser normalizes this state before loading. The current HTTP adapter maps search to `filter.<searchField>`, emits ordinary keyed filters, and sends only the **canonical expression source** for `listExceptions`. The API recompiles that source at its trust boundary and passes the compiled AST to storage. In-memory storage evaluates it before ordinary filtering, sorting and paging; `true` means **exclude this row**. This preserves a storage-neutral predicate contract that a future relational adapter can translate rather than forcing browser-side post-filtering.

Authorization filtering runs before list exceptions and ordinary filters so hidden rows do not contribute to paging totals or become probeable through caller filters.

### Selection semantics

Selection is runtime state, not entity data. `none`, `single` and `multiple` are canonical selection modes. Reload prunes selected ids that are no longer present in the loaded page. A selector consumes this generic selection behavior and adds its caller/result semantics; it is not a second list engine.

## Entry contract

An entry owns one canonical record transaction inside its UI level. Canonical field state, the live record projection, baseline projection, derived field policy and private aggregate contributors cooperate to determine whether persistence is ready.

Scalar semantic values are published through the canonical field runtime. Compound editors keep their internal drafts private and contribute only aggregate facts such as dirty/valid/blocks-persistence until their values are reconciled into the parent transaction.

The shared aggregate policy reduces these facts to:

```text
dirty   = fieldDirty || contributorDirty
valid   = fieldValid && contributorValid
blocked = contributor blocks persistence

saveReady = dirty
         && valid
         && !blocked
         && !loading
         && !saving
         && !deleting
         && mode != view
```

This policy is deliberately host-neutral. Browser code owns DOM validity checks and contributor registration; the policy only reduces supplied facts.

## Client feedback versus API authority

The generic browser entry currently uses native/control validity (`checkValidity()` / `setCustomValidity()`) together with component-specific structured validation where required. That validity participates in aggregate Save readiness.

Do not infer from that fact that every canonical metadata constraint is already enforced by one universal API validator. Current API enforcement is composed from concrete authoritative mechanisms, including:

- canonical field normalization in the generic service;
- metadata-declared uniqueness in storage/repository behavior;
- persisted calculated-value materialization before commit;
- entity/domain service invariants where required;
- relationship delete/integrity policy;
- authorization and trusted command boundaries;
- physical schema semantics supplied by capable storage adapters.

Canonical metadata is still the semantic source of truth, but documentation and implementations should distinguish a **declared semantic requirement** from the particular runtime/adapter that currently enforces it.

## Relationship contract

Relationships are registered on the referencing object and identify source fields, target object/fields, cardinality, optional junction semantics and delete policy. The generic integrity service discovers inverse impacts from that registry; inverse delete metadata is not duplicated on the target.

Delete planning and execution are separate from confirmation presentation. The API recalculates the impact plan before execution. Current delete actions are `restrict`, `cascade`, `set-null`, `unlink` and `retain`; confirmation is independently `silent`, `confirm` or `inherit`.

## Extension rule

When a new behavior applies to lists, entries, relationships or validation across entities, extend the appropriate shared metadata/runtime/API contract and its generic regression coverage. Entity-specific code is appropriate only for genuine domain invariants that cannot be expressed safely by the reusable contracts.
