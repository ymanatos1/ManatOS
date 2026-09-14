# Architectural Principles

## Semantic ownership

Every mutable fact has one authoritative owner. Projections, mirrors, UI decoration and caches may expose that fact, but they must not silently become alternative writers. This is especially important for CTX field values, entry baselines, authorization, calculated values and aggregate workspace state.

## Metadata before repetition

Reusable structure belongs in canonical metadata, UI metadata, expressions, policies or reusable components before it belongs in an entity-specific route or browser branch. The test is semantic: application-specific behavior remains application-specific when it cannot safely be generalized.

## Declarative decisions

If a decision depends only on CTX-observable state and has no side effects, first evaluate whether it belongs as a declarative expression. This makes the decision inspectable, dependency-aware and reusable. Side effects, I/O and transactional operations remain imperative commands.

## Server authority, client interaction

The API owns security-sensitive truth, authorization, protected commands and persistence validation. The browser owns interactive UI state and evaluates UI-owned declarative decisions from safe facts. A hidden button is presentation; it is never authorization.

## Structured semantics across boundaries

Relationships, predicates, metadata, capabilities and expression source remain structured as long as another layer needs their meaning. A future storage adapter should be able to translate a query predicate rather than receive already-filtered browser results.

## Lifecycle-aligned ownership

Root context, UI levels, entry fields, popups, selectors and aggregate workspaces have different lifetimes. State is created, mutated and disposed by the lifecycle that owns it. A child UI level must not retarget writes belonging to its parent entry.

## Observable causality

One logical mutation should produce one authoritative change and one causal event story. Reactive calculations subscribe to semantic dependencies rather than incidental DOM behavior.

## Generic infrastructure is exercised by concrete applications

The platform is not kept abstract for its own sake. protoCRM and the system-administration domain exercise the generic contracts and expose where reusable infrastructure ends and domain behavior begins.

## Diagnostics expose the model

CTX and API activity are inspectable because metadata-driven/reactive systems are difficult to reason about when effective state and ownership are invisible.

## Tests defend architecture

Tests cover behavior and structural contracts: metadata shape, responsibility boundaries, runtime semantics, security, UI presentation and integration. A refactor should preserve these contracts rather than merely keep a page visually operational.
