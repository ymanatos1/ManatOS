# Application Design Principles

Application design begins with domain meaning rather than screens. Define entities, relationships, invariants, security boundaries and business vocabulary first; then decide which parts belong in metadata, expressions, reusable components or explicit commands.

## Governing rules

1. **Keep domain truth independent of one screen.** A relationship, calculated identity or business restriction must not exist only because a particular form needs it.
2. **Prefer metadata for recurring structure.** Entity fields, list presentation, entry tabs, relationships and reusable presentation policy should be declared where a generic runtime can interpret them consistently.
3. **Prefer expressions for pure observable decisions.** When a decision depends only on CTX-observable state and has no side effects, first evaluate whether it belongs in a declarative expression.
4. **Keep authorization on the API.** Client visibility or disabled-state logic may explain policy but never replaces server enforcement.
5. **Use components for reusable interaction, not as an escape hatch.** A custom component is justified by compound interaction or reusable workflow semantics, not merely because metadata feels inconvenient.
6. **Preserve structured data contracts.** Predicates, relationships and invocation information should stay structured through the relevant boundaries so later storage/runtime implementations can reason about them safely.
7. **Reuse canonical entry representation.** A record should keep the same semantic name, type, description and status in lists, selectors, references and related collections.

## Decision sequence

```text
Business requirement
      |
      v
Domain entity / relationship / invariant?
      |
      +--> yes: canonical model
      |
      v
Pure decision over observable context?
      |
      +--> yes: expression / dynamic metadata
      |
      v
Reusable single-field interaction?
      |
      +--> yes: field component
      |
      v
Reusable compound interaction/workflow?
      |
      +--> yes: composite or UI component
      |
      v
Security, persistence or side effect?
             |
             +--> explicit API/domain command
```

Application documentation should describe both business meaning and technical representation, and should link to the deeper architectural contract when a mechanism is reused rather than redefining it locally.
