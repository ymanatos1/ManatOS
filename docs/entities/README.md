# Entities

The entity subject documents ManatOS's reusable metadata-driven business-object infrastructure: canonical field types, lists, entries/forms, components, relationships, selectors/popups, validation and compound workspaces. `SysBO` is only the naming/category convention for systemic objects; the mechanisms here are intentionally reusable by future application-defined entities.

## Capability map

An entity definition supplies canonical metadata. Generic runtimes then compose that metadata with UI metadata, CTX, expressions, authorization capabilities and API data to provide:

- list/search/filter/order/page experiences;
- create/view/edit entry surfaces with tabs and typed fields;
- defaults, normalization, validation and calculated values;
- reference and enum selection;
- related-record collections and reusable components;
- popups/selectors and nested UI levels;
- hierarchy/aggregate workspaces;
- save/cancel/delete and dirty/baseline semantics;
- authorization-aware presentation and developer diagnostics.

The documents below explain how those capabilities fit together; CTX, expression, API, storage and security internals remain canonical in their own subject folders.

## Reading map

- [`Entity-Model.md`](Entity-Model.md) — canonical entity identity, metadata and exposure model.
- [`Fields.md`](Fields.md) — every supported canonical field type, value semantics and the field-type/value-source distinction.
- [`Field-Components-Detail.md`](Field-Components-Detail.md) — how typed fields are rendered/edited and how field components interact with CTX.
- [`Entity-Lists.md`](Entity-Lists.md) — generic list capabilities and internal request/runtime flow.
- [`Generic-List-and-Entry-Contracts.md`](Generic-List-and-Entry-Contracts.md) — host-neutral list/entry state, query transport, aggregate persistence readiness and enforcement boundaries.
- [`Entity-Entries.md`](Entity-Entries.md) — generic entry/form capabilities and lifecycle.
- [`Entry-Opening-Invocation-and-Optimization-Audit.md`](Entry-Opening-Invocation-and-Optimization-Audit.md) — current entry-opening/caller matrix, duplication audit and staged single-opener optimization baseline.
- [`Entity-Entries-Forms-Detail.md`](Entity-Entries-Forms-Detail.md) — deeper entry state, baseline, save and composition mechanics.
- [`Persistence-Commit-and-Recovery.md`](Persistence-Commit-and-Recovery.md) — persistence boundaries, discard semantics, Create Organization continuation drafts and abnormal outage recovery.
- [`Components.md`](Components.md) — reusable metadata component architecture and ownership rules.
- [`Component-Catalog.md`](Component-Catalog.md) — current component implementations and their capabilities.
- [`Composite-Components.md`](Composite-Components.md) — compound components and aggregate state.
- [`Relationships.md`](Relationships.md) — canonical relationship metadata, delete policy and related navigation.
- [`Popups-and-Selectors.md`](Popups-and-Selectors.md) — popup/selector semantic contracts.
- [`Using-Selectors-and-Popups.md`](Using-Selectors-and-Popups.md) — practical usage flow.
- [`Hierarchy-Workspaces.md`](Hierarchy-Workspaces.md) — transactional hierarchy/organization editing.
- [`Validation.md`](Validation.md) — field/entry validation ownership and UI/API boundaries.
- [`Working-with-Entities.md`](Working-with-Entities.md) — broad developer/runtime guide.
- [`Entity-Catalog.md`](Entity-Catalog.md) — current registered entity catalogue.
- [`Adding-an-Entity.md`](Adding-an-Entity.md) — extension workflow.
- [`Adding-a-Component.md`](Adding-a-Component.md) — reusable component extension workflow.

## Related subjects

Canonical metadata schemas live in [`metadata/`](../metadata/); observable runtime ownership in [`context/`](../context/); calculations/reactivity in [`expressions/`](../expressions/); API/storage/security authority in [`api/`](../api/), [`storage/`](../storage/) and [`security/`](../security/).
