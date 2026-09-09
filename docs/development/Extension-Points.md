# Extension Points

The system is intended to grow through explicit contracts rather than by accumulating special cases in shared runtime code. An extension should therefore attach at the narrowest semantic layer that actually owns the new behavior.

## Main extension points

- **canonical metadata** for new entity fields, relationships and calculations;
- **UI metadata** for lists, entries, actions and dynamic presentation;
- **expression functions** for reusable pure calculations over supported context;
- **field components** for new single-field interaction semantics;
- **composite/UI components** for reusable compound interaction or workflows;
- **platform contributions** for product-specific navigation/assets/applications;
- **API services/commands** for business operations and side effects;
- **storage adapters** for alternate persistence implementations.

## Selection rule

Prefer extending an existing generic contract over adding entity-specific branching. A new extension point is justified when the existing abstraction cannot express the required semantics cleanly without becoming misleading or leaking responsibilities across layers.

Each extension should include contract-level tests and documentation identifying ownership, lifecycle and interaction with CTX/security/persistence where applicable.
