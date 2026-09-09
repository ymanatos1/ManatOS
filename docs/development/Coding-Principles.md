# Coding Principles

Before adding a branch, identify the semantic owner. If the decision is side-effect-free and CTX-observable, evaluate an expression first. If the behavior is structurally reusable across entities, prefer metadata/common runtime. If it is security-sensitive, keep authority on the API.

Do not create a second writable copy of state for convenience. Do not parse/reconstruct structured contracts ad hoc in downstream UI code. Do not make a child popup discover its parent ownership by assuming the current leaf remains the parent. Do not use DOM state as the source of business/runtime truth when CTX owns that state.

Keep browser production behavior and TypeScript semantic runtime contracts aligned. Tests should defend both observable behavior and responsibility boundaries.

Names should describe present semantics rather than migration/version history. Comments should explain ownership, invariants or non-obvious rationale rather than narrate past implementation.
