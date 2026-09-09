# Selectors and Popups

Selectors and popups provide nested interaction without forcing the user to abandon the owning entry. They are reusable UI surfaces with their own child CTX level and lifecycle.

## Existing-record selector

A reference field or another calling component can open the generic record selector with a target entity, purpose, candidate/eligibility rules and invocation parameters. The selector reuses canonical list metadata, search, filters, paging and entry representation. Selecting a record returns the canonical selected result to the caller.

```text
Owning entry/component
        |
        | open selector + calling parameters
        v
Record selector
  ├── search / filters / paging
  ├── eligibility policy
  └── canonical candidate presentation
        |
        | selected record
        v
Owning entry/component applies caller-specific operation
```

Clearing is available only when the invocation allows it. The selector does not decide what the selected record means to the caller.

## CTX ownership

A popup is a child UI level. While open it may be the deepest level in `ctx.ui`, but it does not become the owner of the parent's fields. Closing the popup disposes its child context and returns interaction to the parent. This distinction is essential for nested selectors and compound workspaces.
