# Business Rules and Application Policies

An application design may contain **declarative calculations**, **interaction rules**, **workflow decisions**, **authorization policy** and **data-integrity constraints**. These are not one interchangeable rules engine. Their authority and side-effect boundaries determine where each belongs.

| Rule type | Appropriate owner | Example |
|---|---|---|
| Canonical field meaning | Entity/field metadata | required value, allowed options |
| Calculation / normalization | Constrained expression + authoritative caller | derived display name or canonical total |
| Conditional UI presentation | UI View and UIS/CTX | hide an irrelevant field or enable an eligible action |
| Process coordination | Flow and trusted operation endpoints | authentication or controlled multi-step action |
| Relationship integrity | Canonical domain/API/storage | reject invalid reference or restricted deletion |
| Role/record permission | API authorization | may Person update this record? |
| Purchased product entitlement | License and policy service | can organization run this application? |

```text
Rule concerns one view? ──────────────► UI metadata / UIS
Rule derives a value without effects? ► constrained expression
Rule coordinates multiple steps? ─────► Flow + trusted commands
Rule protects data or resource access? ► authoritative API
Rule models purchased capability? ────► License + API policy
```

A rule that changes business data, accesses a secret, interprets a purchased entitlement or authorizes a mutation cannot be made trustworthy merely by moving it into a client-side expression. Conversely, duplicating the same presentation rule separately in each adapter undermines portability.

See [Application Design and Execution](Application-Design-and-Execution.md), [Expressions](../../expressions/Expressions.md), [Authorization Policy](../../security/Authorization-Policy-Architecture.md) and [Storage Architecture](../../storage/Data-and-Storage-Architecture.md).
