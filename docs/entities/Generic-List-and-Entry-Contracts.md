# Generic List and Entry Contracts

ManatOS keeps list browsing, single-record editing and selector use on reusable contracts rather than entity-specific route logic. The contracts are related, but they own different state and cross different authority boundaries.

## List contract

The host-neutral `EntityListRuntime` owns one normalized query plus the current loaded page, its original loaded projection, selection, loading state and paging result. Its definition supplies entity identity, resolved list-view key, id field, columns, selection mode, data source and optional canonical entry projection. The runtime publishes the non-executable part of that definition as an immutable `EntityListDescriptor`, so CTX/presentation consumers can observe which semantic list definition produced the state without acquiring the data source or projection functions.

For SysBO-backed lists, the server adapter is also canonical: `sysBOEntityListDataSource()` translates the host-neutral `EntityListQuery` into the existing API query contract and applies calculated-record projection before rows enter list state. `sysBOEntityListRuntime()` resolves the metadata list view into the runtime definition, while `sysBOListReferenceData()` derives the reference catalogues required for presentation. Browse pages and parent-list snapshots therefore do not independently implement acquisition/projection/reference planning; related entity-query collections reuse the same data-source boundary. This is a resource adapter, not a Host: Page/Popup/Embedded lifecycle remains a later host concern.

```text
EntityListDefinition
  -> EntityListRuntime
       definition / EntityListDescriptor
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

Selection is runtime state, not entity data. `none`, `single` and `multiple` are canonical selection modes. Selected IDs remain canonical across page loads, so a multiple-selection surface can retain choices that are not on the currently loaded page. A selector consumes this generic selection behavior and adds only caller/result semantics; it is not a second list engine. The runtime deliberately exposes selected IDs rather than a misleading `selectedEntries()` projection of only the current page; a host that needs selected records must resolve them from its authoritative candidate/resource set.

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

### Stage 19D — selector and related-list convergence

Record Selector is a popup presentation of the same `EntityListRuntime` used by browse lists. Search, filters, paging and selected IDs are canonical List runtime state and are published under the selector UiLevel's `list` node; popup code owns only candidate eligibility/presentation and returning the selected record to its caller. Selection is retained across page loads by the List runtime.

Related collections retain the parent-owned draft/persistence semantics established by Stage 18. Their read-side entity-query acquisition and calculated-record projection use the canonical List resource/data-source pipeline; related-list view switching remains local presentation state. This deliberately does not turn a parent-owned editable collection into an independently persisted List surface.

### Stage 19E — production closure

The Stage 19 closure audit leaves one semantic owner for List query, loaded-page state, paging, loading and selection: `EntityListRuntime`. SysBO routes adapt HTTP/session input into that canonical query and use the shared list resource pipeline; they do not manufacture a second transport query object. Record Selector delegates query/paging/selection to the same runtime. Related entity-query collections reuse the same acquisition/projection boundary while retaining Stage 18 parent-owned collection drafts.

The remaining browser HTML fetch/DOM replacement on ordinary browse pages is a presentation/transport adapter, not an independent List state machine: returned bootstrap state is synchronized into the canonical List CTX before presentation replacement. Universal Page/Popup/Embedded host ownership is intentionally deferred to Stage 20. Hierarchy/workspace list-shaped state is likewise not silently reclassified here; its aggregate ownership is addressed by the dedicated Organization/hierarchy migration stage.

### Stage 20B — browser host bridge convergence

Client-opened popup and embedded child surfaces now cross the typed `UiRuntime.open()` boundary through the browser host bridge. The legacy browser host still prepares the current CTX presentation envelope during the transition, but it no longer owns child `UiLevel` topology or lifecycle once the TypeScript browser runtime is installed. Typed popup/embedded host strategies adopt the child, mount its canonical CTX, and `UiRuntime.close()` performs deepest-first disposal. The old mutation path remains only as a bootstrap-order fallback until the compatibility bootstrap host itself moves in the later Stage 20 steps.

### Stage 20C — entry-opening convergence

Semantic entry callers no longer dispatch through a second JavaScript host-adapter registry. `entryOpening.open()` normalizes caller intent and delegates host selection to the typed browser host bridge. The existing routed popup presenter remains the production presentation adapter during the iframe transition, but it is no longer registered as an independent entry host implementation; its `openUiLevel()` boundary continues through `UiRuntime.open()`. Page and embedded Entry production presenters are intentionally not invented here: their universal host convergence belongs to the later Stage 20 steps.

### Stage 20D.1 — direct Entry host re-entrancy prerequisite

Direct popup hosting places page-hosted and popup-hosted Entry surfaces in the same browser document. Entry browser behavior must therefore be surface-local and re-entrant before the iframe boundary can be removed. The in-place Save runtime is now an `entrySurfaces` installer: every editable Entry form owns its own Save handler and resolves semantic state from that form's declared `data-ctx-scope-path`, rather than rediscovering a global/deepest Entry. The initialization facade likewise resolves the currently active Entry through its canonical CTX path when several Entry forms coexist. This patch deliberately leaves routed iframe presentation intact; the direct-host cutover follows only after these single-document assumptions are removed.
