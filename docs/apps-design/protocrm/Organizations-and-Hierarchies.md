# Organizations and Hierarchies

Principal parent relationships form the organization structure. The hierarchy workspace provides Tree and Chart representations over the same working graph and supports draft changes before commit.

Root Principal is derived from parent traversal rather than maintained as an unrelated UI-only value. Traversal that requires persisted records uses resolver-backed expression/domain capability rather than assuming every ancestor is loaded in the current list.

The hierarchy workspace is an aggregate transaction: its working graph can be dirty independently of scalar entry fields and therefore contributes to the entry/surface aggregate state.
