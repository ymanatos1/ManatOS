# Entity Entries

An entry surface coordinates one record lifecycle in create, edit or view mode. Initialization resolves source data, defaults/invocation, calculated projections, effective UI metadata, supplemental/related data and authorization facts before interactive state is published.

For scalar fields, `fields.<key>.value` and `originalValue` are the live and baseline authorities. `entry.current` and `entry.original` expose read-only record views. Save serializes the effective current state through the entry-write boundary; successful save establishes the new baseline. Delete is server-authorized and can use preflight impact semantics.

Dynamic field visibility/editability, calculated values and action state react to CTX dependencies. The entry runtime anchors its CTX path at boot so a nested selector cannot become the accidental owner of an entry field update.

Compound editors may contribute aggregate dirty/valid state without pretending their graph/collection state is a scalar field. See [Fields](Fields.md), [State, Mutation and Events](State-Mutation-and-Events.md), and [Hierarchy Workspaces](Hierarchy-Workspaces.md).
