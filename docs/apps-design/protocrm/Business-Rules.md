# Business Rules

Business rules are represented at the layer that owns their semantics. The platform intentionally avoids concentrating every rule either in browser code or in one monolithic service.

## Representative rules

- User ↔ Person Principal relationship integrity;
- Person full-name calculation;
- Parent/Root Principal traversal and organization hierarchy semantics;
- normalized reusable email, telephone and postal-address values;
- platform/application/license relationships and restrictions;
- server-authoritative role and capability policy;
- metadata-driven eligibility and exception predicates for selectors and lists.

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

For expression semantics see [Expressions](../../design/Expressions.md); for authorization boundaries see [Authentication and Authorization](../../architecture/Authentication-and-Authorization.md).
