# Navigation

Navigation is composed from system-level and platform-level contributions. The shell presents only the entries appropriate to the current session, platform capability and required feature/entity availability.

## Visibility and security

A visible menu item is not proof of authorization, and a hidden item is not the authorization mechanism. Visibility is a usability/presentation decision; protected API operations independently enforce policy.

## Logical ownership

Breadcrumbs and nested interaction reflect the UI-level ownership model. Opening a record from a list creates a child entry level. Opening a selector or popup from that entry creates another child level. Closing the child returns to its parent rather than constructing an unrelated navigation history.

```text
Shell
└── Entity list
    └── Entry
        └── Selector / popup / nested workflow
```

This ownership matters because state and field writes belong to the surface that created them, not simply whichever surface is currently deepest.

If an expected administrative item is absent, check the current identity/role, platform access and required entity availability before assuming the feature is missing.
