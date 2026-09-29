# Business Rules

protoCRM owns rules whose semantics belong to its Applications, Apps Playground and future CRM/application tooling. Foundation-level Company-domain identity, Principal hierarchy, licensing and external-authentication rules are documented under the [Company Domain](../../company/README.md) even when protoCRM consumes their results.

## Representative platform rules

- platform/Application availability and navigation contributions;
- Application relationships and restrictions;
- future application-defined entity behavior;
- CRM-specific rules introduced by future protoCRM tools.

## Placement rule

```text
Rule depends only on observable CTX and has no side effects?
        |
        +-- yes --> evaluate as declarative expression/dynamic metadata
        |
        +-- no --> does it enforce security, persistence integrity,
                   secrets, transactionality or external side effects?
                         |
                         +-- yes --> API/domain/service boundary
                         +-- no  --> reusable runtime/component policy
```

A rule should not be duplicated across those layers merely for convenience. UI policy may explain or anticipate a server restriction, but the authoritative restriction remains server-side when security or data integrity is involved.

For expression semantics see [Expressions](../../expressions/Expressions.md); for authorization boundaries see [Authentication and Authorization](../../security/Authentication-and-Authorization.md).
