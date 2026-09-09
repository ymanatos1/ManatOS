# Validation

Validation is part of effective entry state, not merely HTML decoration. Field validation produces validity and issues; aggregate entry validity derives from the participating field/component state.

Validation should be deterministic from the relevant value/context. Client validation improves interaction but does not replace API/domain validation for persisted or protected operations.

A field or compound component reports through its owning runtime rather than directly toggling unrelated Save-button DOM state. Save/action policy consumes aggregate state, keeping the causal chain inspectable.

Validation messages should explain the violated contract in user terms while preserving structured diagnostics where developer inspection needs them.
