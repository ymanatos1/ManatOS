# Validation

Validation answers whether current input/state satisfies the rules required to continue an interaction or persist a change. It is separate from authorization: a value can be syntactically valid while the caller is not allowed to perform the operation.

## Layers

Field-level validation covers type/shape and canonical field rules. Entry-level validation aggregates field and cross-field state. Compound editors/workspaces can add their own validity requirements and may block the parent Save operation while an unresolved child draft is active.

Client validation provides immediate feedback but does not replace API/domain validation for persisted or security-sensitive operations.

```text
field validity ----+
                   |
cross-field rules -+--> entry aggregate validity --> Save eligibility
                   |
child workspace ---+

API/domain validation --------------------------------> persistence authority
```

Validation messages should identify the failing semantic rule where possible rather than merely reporting that Save is disabled. Dynamic required/read-only/visibility policy should derive from metadata/expressions and be evaluated consistently with validation inputs.
