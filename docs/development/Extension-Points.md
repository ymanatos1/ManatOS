# Extension Points

The principal extension points are canonical entity metadata, UI metadata, expression functions, reusable field/content components, platform contributions, API services/commands and storage adapters.

Choose the narrowest extension point that owns the semantics. A field renderer should not become an authorization service; a platform contribution should not modify generic shell code for product-specific navigation; a storage adapter should not invent UI policy.

When no current extension point fits, first determine whether the missing capability is generally reusable. If so, extend the common contract and protect it with architecture tests. If not, keep the behavior in the application/platform domain rather than broadening the foundation artificially.
