# Entity Lists

An entity list is the generic collection surface for a canonical SysBO. It combines entity metadata, UI list metadata, query state and projected canonical records without requiring entity-specific page code for ordinary behavior.

## Responsibilities

Lists own collection query state such as filters, search, ordering/paging and list actions. Rows use canonical field/entry representation, so the same record identity used in references and selectors remains visible in ordinary lists.

List exceptions and eligibility predicates should remain structured through the API/storage boundary where possible. The browser should not fetch an unrestricted dataset merely to apply a rule that could be translated into datastore selection.

```text
metadata + query state
        |
        v
      API
        |
        v
projected records
        |
        v
list toolbar / filters / table / paging / row actions
```

Opening or adding a record creates a nested entry level. The list remains the parent collection context and does not become a second live copy of the entry's scalar field state.
