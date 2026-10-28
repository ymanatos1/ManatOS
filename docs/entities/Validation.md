# Validation

Validation answers whether a candidate field/entry/aggregate state is acceptable. ManatOS deliberately separates immediate client feedback from authoritative server/domain enforcement.

## Sources of validation semantics

Canonical field metadata supplies reusable constraints such as required/nullability, length, enum domain, version grammar and reference semantics. Normalization/calculation expressions can further define canonical values. Relationship/integrity services and authorization add server-side constraints that are not safely reducible to a field control.

UI metadata may add interaction/presentation restrictions for a particular surface, but must not weaken canonical/server rules.

## Client validation

The entry/field runtime can evaluate safe deterministic rules immediately and project validation state into CTX so components and Save/dirty state can react consistently. Field components present errors; they should not each invent their own unrelated rule engine.

A change can produce `validation:changed` / field-state events, but the current validation state remains owned by the runtime rather than reconstructed from event history.

## Server validation

The API revalidates authoritative rules on create/update. This protects non-browser clients and prevents disabled/hidden controls from becoming a security/integrity boundary.

Server validation can include:

- canonical field constraints;
- normalization failures;
- relationship/reference integrity;
- uniqueness;
- entity/domain invariants;
- persisted calculation/traversal errors;
- authorization.

## Normalization versus validation

Normalization converts an acceptable candidate into canonical form; validation determines whether it is acceptable.

For example:

```text
EmailAddress('  USER@Example.COM ')
    -> 'user@example.com'

EmailAddress('not-an-address')
    -> evaluation/validation error
```

The field component does not own this rule.

## Aggregate validation

Compound components can contribute validity to the owning entry. A collection editor with an incomplete child row, or a hierarchy workspace violating a relationship rule, can prevent commit even though every scalar field appears locally valid.

## Error presentation

A client should preserve the user's working state when validation fails, focus/present meaningful errors, and distinguish validation failures from connectivity/server faults. Correcting the offending dependency should clear/recompute derived validation state through the normal mutation/reactivity path.

## Editing feedback and authoritative validation

Presentation validity is derived from current values, metadata rules and resource availability. It controls immediate feedback and whether an action appears ready; it does not replace the API's independent validation of input types, relationship integrity, permission and transaction preconditions. A field being hidden or read-only in UIS does not make a forbidden mutation valid if a caller submits it directly to HTTP.

A validation error should identify the relevant semantic field where possible and retain stable error codes or structured details for localization. The human-readable message may change language; the error category and authoritative decision must not. Distinguish invalid input from transport failure and a stale/failed commit, since each has different reconciliation requirements.
