# Entity Lists

Entity lists are generic metadata-driven collection surfaces. A list is not an entity-specific table template: it composes canonical entity metadata, UI list metadata, API query capabilities, authorization and client CTX into one reusable browsing/selection surface.

## Capabilities

A list can support, as declared by metadata and capabilities:

- canonical/effective columns and entry representation;
- search and field filters;
- ordering and paging;
- metadata-declared list exceptions/predicates;
- create/open/view/edit actions;
- metadata-declared row actions;
- reference/related-record selector mode;
- authorization-aware collection and row visibility;
- refresh after mutations/navigation;
- CTX/debugger visibility and nested UI-level ownership.

Not every entity/surface enables every action. The same runtime is constrained by metadata, invocation mode and server capabilities.

## Data flow

```text
entity + UI metadata
       |
       v
list surface / CTX level
       |
       +--> query state (filter/order/page/search)
       |
       v
API list request
       |
       v
authorization + storage/query execution
       |
       v
items + paging (+ metadata/capabilities as requested)
       |
       v
ctx level list/resources -> generic presentation
```

The API remains authoritative for collection authorization and record visibility. A client-side hidden row is not a security boundary.

## Query state

List state represents the user's current browse operation rather than persisted entity data. The host-neutral list runtime owns a normalized query (`page`, `pageSize`, search/search-field, sort/direction, keyed filters and optional list-exception predicate), loaded/current projections, selection, loading and paging state. Page and selector hosts consume that same state machine.

List exceptions use a canonical compiled expression in browser runtime state. The current HTTP adapter sends only its canonical source; the API compiles that source at its trust boundary and storage receives the compiled AST. In-memory storage applies it **after authorization filtering but before ordinary filters, sorting and paging**, with `true` meaning exclude. A future RDBMS adapter can translate the same storage-neutral predicate into a parameterized physical predicate. The browser should not retrieve an exception set and then pretend post-filtering is equivalent.

## Columns and representation

Columns derive from canonical fields plus UI list declarations. A value is rendered according to canonical type and entry/option metadata rather than entity-specific formatting in the table engine.

References can use canonical target entry representation. Enums can use labels/icons/tones. Calculated fields are normal typed fields and appear through the same presentation path.

## Actions

A list can expose top-level actions such as **Add** and row-level actions such as open/edit or metadata-declared custom actions. Action availability is a composition of:

- the surface mode;
- UI metadata;
- server-projected capabilities/authorization;
- current row state where relevant.

Action expressions may make side-effect-free presentation decisions; the API still authorizes the resulting command/request.

## Selector mode

The generic list mechanics also underpin record selectors. Selector invocation narrows behavior to selection:

```text
caller field/component
   -> opens selector child UI level
   -> list loads authorized candidate catalogue
   -> metadata/referenceSelection filters candidates
   -> user chooses row
   -> selector returns semantic selection
   -> caller updates canonical field value
```

A selector is therefore a list-like surface with a different invocation/result contract, not a second entity-list implementation.

## Authorization and reference catalogues

Collection capability is obtained from authoritative API policy. Row-level authorization can further scope returned data—for example Users to self, or Principals/Licenses to the caller's organization.

When a referenced catalogue itself is forbidden, generic client data access treats the forbidden catalogue as unavailable/empty for the referencing UI rather than crashing the whole entry page. Unexpected transport/server errors still propagate.

## Navigation and nested levels

Opening an entry from a list creates a child UI level under that list. Opening a selector from the entry creates another child. The recursive CTX chain preserves logical ownership and breadcrumb/navigation semantics without creating unrelated global page objects.

See [Client Context Model](../context/Client-Context-Model.md).

## Refresh and reconciliation

After a successful create/update/delete that affects the visible collection, the list refreshes or reconciles from authoritative data. It should not permanently rely on an optimistic DOM-only row.

A selector may also need to refresh candidate availability after related creation or one-to-one assignment.

## Diagnostics

The CTX Viewer can inspect list surface state/resources. API Traffic exposes the actual list query request/response and correlated API diagnostics. Expression tooling can inspect metadata formulas involved in columns/actions/candidate rules.

## Example: Principals list

A Principals list can show canonical Principal representation and fields, accept filters/order/page state, and return only records authorized for the authenticated organization unless Admin policy allows the full collection. Opening "Maria" creates an entry child level. A parent-reference selector opened from Maria is another child level and uses the same generic list/selector machinery with reference candidate restrictions.

## Extension rule

If a new list feature is reusable across entities, add it to the metadata/list runtime contract and cover it with generic regression tests. Do not implement `if (entityKey === ...)` inside list infrastructure merely because the first use case came from one entity.

See [Generic List and Entry Contracts](Generic-List-and-Entry-Contracts.md) for the precise runtime/query/authority contract.
