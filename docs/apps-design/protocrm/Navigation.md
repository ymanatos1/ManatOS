# Navigation

Platform navigation is contributed declaratively and composed by the common shell. The current platform contributes **Apps Playground** and Administration → **Applications** when the authenticated user's safe `platformAccess` capability permits those surfaces to be presented.

## Presentation versus authorization

Navigation visibility is a presentation decision. It prevents the shell from advertising unavailable functionality, but it is not the security boundary. The API independently authorizes protected entity and command operations.

## Availability checks

A navigation contribution can depend on required entity/capability availability as well as user/platform access. This avoids presenting a menu option whose underlying contracts are absent or disabled.

```text
server-resolved capability facts
            |
            v
platform navigation contribution
            |
            +--> requirements satisfied? -- no --> hidden
            |
           yes
            v
       visible menu item
            |
            v
    protected API operations
    (authorized independently)
```

Navigation should therefore remain declarative and capability-driven, while business authorization remains server-owned.
