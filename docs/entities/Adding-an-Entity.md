# Adding an Entity

This guide describes how to add an entity without creating a parallel CRUD/presentation/storage framework. Read [Metadata Architecture](../metadata/Metadata-Architecture.md) and [Entity Model](Entity-Model.md) first.

## 1. Decide ownership and naming

Determine whether the entity is:

- foundation-level Company-domain;
- platform-owned (for example protoCRM);
- future application-defined.

Reserve the `SysBO` naming/category convention for **system-owned** entities. The generic entity infrastructure itself is not SysBO-specific.

Ownership affects registry composition, navigation/application design and authorization policy; it should not change the fundamental metadata/runtime/storage machinery.

## 2. Define canonical entity metadata

Add the canonical entity definition in the appropriate shared metadata/domain module and register it.

Define each field once, including applicable:

- type;
- required/nullability semantics;
- length/uniqueness semantics;
- enum values/items;
- canonical create default;
- reference target;
- calculation expression and persisted state;
- canonical representation contribution.

Do not put a persisted/default/integrity semantic only into UI metadata merely because the first consumer is a form.

## 3. Define relationships canonically

If the entity references or owns other entities, define relationship metadata rather than relying on a UI component to imply the relationship.

Specify cardinality, source/target fields and delete behavior. Consider whether the relationship requires aggregate transaction semantics.

Internal junction/value entities are acceptable where normalization/reuse requires them; they need not have standalone UI metadata.

## 4. Define UI metadata separately

Add UI metadata only for presentation/interaction concerns:

- list columns, filters and sorting;
- entry tabs/field ordering;
- field presentation overrides;
- actions;
- related collections;
- reusable components;
- expression-backed UI state.

Reuse generic list/entry/field/reference/selector behavior before introducing entity-specific templates or JavaScript.

## 5. Prefer declarative decisions

For any visibility/read-only/action/default/presentation decision, ask whether it is side-effect-free and based on CTX-observable state. If so, prefer declarative metadata/expression form.

If the needed state is not observable, assess whether adding a correctly owned CTX fact/resource is architecturally justified before hardcoding the decision in a page component.

## 6. Use generic service/storage behavior

Most entities should work through the generic entity service and repositories.

Add entity-specific application service behavior only when the entity has real business semantics that cannot be expressed by canonical metadata/generic relationship/calculation infrastructure.

Never add adapter-specific behavior to an entity service. Persistence invariants belong to canonical metadata and storage strategy.

## 7. Add server authorization

Define collection and record authorization deliberately.

Ask separately:

- may this role enter/query the collection?
- which rows may the role read?
- may a direct record GET return the same row?
- which records may be created/updated/deleted?
- what safe capability facts should the UI receive?

Row-scoped collections should use the same predicate for list filtering and direct record access. A relational adapter should eventually translate the predicate into datastore selection.

## 8. Keep reference catalogues least-privileged

A readable parent entity can reference an entity the same user cannot browse. Generic presentation code must not turn that reference into a privilege escalation.

Where labels/options are unavailable because the referenced catalogue is forbidden, the authorized parent surface should degrade appropriately without granting access to the referenced data.

## 9. Verify storage projection

Confirm the entity participates correctly in storage-neutral semantics:

- unique fields project uniqueness requirements;
- reference fields project semantic references;
- persisted calculations project calculation source;
- non-persisted calculations do not become physical columns;
- relationship behavior remains provider-independent.

For relational entities, check the desired semantic schema projection rather than writing engine-specific DDL by hand.

## 10. Add targeted tests

Coverage should normally include:

- canonical metadata contract;
- UI metadata/presentation contract;
- authorization collection/record behavior;
- API list/read/mutation integration where significant;
- relationship/delete behavior;
- calculation/default semantics;
- runtime/list/entry behavior for unusual components;
- architecture contract preventing entity-specific hardcoding where reusable infrastructure is expected.

Then use the repository-wide verification flow as the integration gate.

## 11. Update documentation

Update:

- [Entity Catalog](Entity-Catalog.md);
- company/platform/application-design documentation according to ownership;
- API/reference docs for any explicit command;
- component/reference docs for genuinely new reusable components;
- architecture only when the entity introduces a new general architectural concept.

Do not document one entity as though it owns generic framework behavior.

## Review checklist

A well-integrated entity should answer “yes” to these questions:

- Does canonical metadata describe the entity without requiring a UI page to understand it?
- Can generic list/entry/reference infrastructure render it?
- Are authorization rules server-owned and consistent for list/direct reads?
- Are relationships/calculations/defaults declarative where they belong?
- Can storage adapters preserve its semantics without entity-specific adapter branches?
- Are platform/company ownership and SysBO terminology correct?
- Do tests protect reusable infrastructure rather than only one happy-path screenshot?
