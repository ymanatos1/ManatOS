# State, Mutation and Events

## Purpose and audiences

CTX is useful only if a change can be observed consistently. This document explains the change model behind ManatOS CTX: how a value changes, how the runtime describes the cause, how expressions discover dependencies, how recalculation cascades settle, and how developers can inspect the resulting graph.

It is written for several audiences:

| Reader                      | What to take from this document                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Application/metadata author | How to write expressions that react to the correct CTX paths and avoid hidden dependencies.                        |
| UI/component developer      | How to mutate CTX, subscribe to changes and clean subscriptions up without inventing another event channel.        |
| Runtime/framework developer | The ownership, event identity, dependency matching, cascade and loop-prevention contracts.                         |
| Debugger/tooling developer  | How semantic node metadata and subscriber telemetry explain why a node is observable.                              |
| Architect/reviewer          | Which values are authoritative, which are projections, and where duplicated mutation/event authority is forbidden. |

The central architectural rule is simple: **one logical CTX change has one authoritative mutation and one causal history**. Derived projections may make the same fact convenient to read elsewhere, but they must not become independent writable truths.

## Why CTX needs an event model

Without an observable context, a metadata expression such as a calculated full name would have to be reimplemented by each form, popup and future client. CTX gives the rule a stable address space. The event/dependency layer then connects that address space to live behavior:

```text
user / runtime / calculation
          |
          v
canonical CTX value changes
          |
          +------> debugger / subscribers
          |
          v
dependent expressions
          |
          v
derived CTX or UX changes
```

This separation matters. DOM controls are views of CTX; they are not the dependency graph. A calculation therefore depends on `ctx...fields.firstName.value`, not on a particular `<input>` element or an input event.

## Conceptual mutation pipeline

The target semantic pipeline is:

```text
write(path, value, cause)
          |
          v
   resolve + validate ownership
          |
          v
      changing
          |
          v
   canonical mutation
          |
          v
       changed
          |
          v
 dependency invalidation
          |
          v
 calculated / UX settlement
          |
          v
      subscribers
```

### 1. Resolve the path

The runtime resolves the canonical CTX address and the semantic node it identifies. Canonical paths are important because dependency matching, debugger navigation and subscriber telemetry must all refer to the same identity.

For entry values, the canonical mutable scalar is currently the field value path, for example:

```text
ctx.ui.level.level.fields.firstName.value
```

A convenience projection such as `entry.current.firstName` must not become a second mutation authority.

### 2. Validate ownership and mutability

Before mutation, the owner determines whether the node can be changed. Read-only/derived values cannot be bypassed simply because JavaScript can technically reach the object. This is where the CTX semantic contract is stronger than ordinary object assignment.

Typical ownership examples:

| Node                 | Typical owner                    | Writable?                                              |
| -------------------- | -------------------------------- | ------------------------------------------------------ |
| `fields.<key>.value` | entry field runtime              | yes, subject to field semantics                        |
| `entry.original`     | entry initialization             | no after initialization                                |
| `entry.current`      | field projection                 | derived/read-only projection                           |
| `state.dirty`        | aggregate entry/surface state    | runtime-derived                                        |
| `facts.*`            | bootstrap/API/runtime fact owner | normally replaced by its owner, not edited by controls |
| `presentation.*`     | surface/presentation runtime     | only through the owning presentation mechanism         |

### 3. Record the cause

A mutation is not merely `old -> new`. Its cause explains _why_ it happened and lets a cascade retain causal identity. Browser CTX change details currently carry `source`, `eventId`, `rootEventId` and `triggerPath`; related paths can be supplied for diagnostics.

Conceptually:

```text
cause
+-- source       who initiated this step
+-- eventId      identity of this concrete event
+-- rootEventId  identity of the original causal chain
+-- triggerPath  path that triggered this step
```

`rootEventId` is especially useful for a cascade: changing `firstName` may calculate `fullName`, which may update presentation. Those are separate mutations but one causal family.

### 4. Perform the canonical mutation

Only the authoritative representation is written. Projections and aggregate state are then updated/derived by their owners. This rule prevents two components from racing to synchronize two copies of the same fact.

### 5. Emit the changed event

The browser-visible CTX event is `manatos:ctx-change`. Its detail identifies the canonical path, operation, old/new values and cause. Consumers should use this event as notification; they should not treat the event payload as another state store.

A simplified shape is:

```text
change detail
+-- operation      add | replace | delete | ...
+-- path           canonical changed CTX path
+-- relatedPaths[] diagnostic/projection paths affected by the same operation
+-- oldValue
+-- newValue
+-- cause
    +-- source
    +-- eventId
    +-- rootEventId
    +-- triggerPath
```

`relatedPaths` are **not additional mutation authorities**. They tell diagnostics and interested consumers that one authoritative change has observable consequences elsewhere.

## Current runtime layers and convergence

ManatOS currently has two implementation layers participating in this architecture:

1. The browser CTX runtime exposes the public live CTX tree, `manatos:ctx-change`, semantic node descriptions and subscriber telemetry.
2. TypeScript surface runtimes use typed surface events such as `value:changed`, `entry:initialized` and `ctx:changed` internally for field, validation and calculation behavior.

They express the same architectural semantics, but the cleanup programme is intentionally converging mutation/event ownership further. New functionality must **not** create a third mutation path or event system. The desired endpoint is one universal CTX access/mutation mechanism with typed runtime adapters where useful.

This distinction is important for framework developers; ordinary metadata authors should think in canonical CTX paths and expressions rather than implementation-layer events.

## Mutation causes

A cause classifies the origin without changing mutation semantics. Common conceptual causes are:

| Cause           | Meaning                                         | Example                               |
| --------------- | ----------------------------------------------- | ------------------------------------- |
| user edit       | direct user interaction                         | typing a new first name               |
| initialization  | constructing a surface from authoritative input | opening an existing User              |
| default         | applying declarative create defaults            | defaulting `enabled` for a new record |
| calculation     | expression-derived value                        | recomputing `fullName`                |
| validation      | validation-derived state                        | changing field validity/issues        |
| lifecycle       | surface/entry operation                         | entering saving/deleting state        |
| command/runtime | explicit runtime operation                      | refreshing bootstrap-owned facts      |

A cause is diagnostic and causal metadata. It must not be used as an excuse to bypass ownership rules—for example, a `calculation` should still write through the canonical mutation mechanism.

## Dependency model

### What a dependency means

An expression dependency is a canonical CTX path whose change can invalidate an expression result. Compilation identifies these paths before repeated execution, allowing the runtime to react to state rather than repeatedly rediscovering dependencies from source text.

Example:

```text
fullName calculation
  depends on fields.firstName.value
  depends on fields.lastName.value
```

When either dependency changes, the calculation becomes eligible for reevaluation.

### Exact and overlapping paths

Dependencies are hierarchical. A change to a descendant can matter to a consumer of an ancestor and vice versa. The dependency runtime therefore considers paths related when they are equal or one is a descendant of the other.

```text
fields.address
fields.address.city
```

A consumer deliberately depending on `fields.address` is interested in a change to `fields.address.city`. Authors should nevertheless choose the narrowest stable dependency that expresses the rule; broad dependencies cause unnecessary reevaluation and make debugging less precise.

### Local and owner-qualified dependencies

Calculations can react to local field paths and to owner-qualified surface paths. This lets a child surface inherit or depend on legitimate ancestor state without copying that state into the child.

The principle is: **reference the owner; do not duplicate the fact merely to make it locally convenient.**

### Initialization is special but deterministic

An initialized field may equal its original value, so no ordinary `value:changed` event is necessarily emitted. Initialization therefore performs a deterministic initial evaluation when the entry is initialized. Calculated values and UX expressions do not have to wait for the user to edit something before becoming correct.

## Recalculation and cascade settlement

A dependency change can produce another CTX change:

```text
firstName.value changes
        |
        v
fullName expression invalidated
        |
        v
fullName.value recalculated
        |
        v
consumers of fullName invalidated
```

Calculated writes re-enter the normal mutation/event semantics. This is essential: downstream expressions should not care whether their input was typed by a user or calculated by another expression.

### Loop protection

A dependency graph can accidentally contain cycles. The calculation runtime tracks active calculation targets while settling a causal step. If the same target is already active, it is not recursively re-entered during that step. This is a guard, not permission to design cyclic business rules; metadata should still form understandable, terminating dependency relationships.

### Determinism

For the same authoritative CTX state and same side-effect-free expression, calculation results should be deterministic. Clock access, entity resolution and other capabilities are explicit precisely because they change what an expression needs from its execution host.

## Derived state and projections

Derived values should be computed from authoritative state instead of independently synchronized whenever practical:

```text
field dirty    = field.value vs entry.original[field]
entry.current  = projection of fields[*].value
surface dirty  = aggregate owned dirty state
```

### Why this matters

If both `fields.firstName.value` and `entry.current.firstName` were freely writable, every mutation would require bidirectional synchronization, ordering rules and conflict handling. That is exactly the kind of accidental complexity CTX is intended to remove.

A derived value may be cached for efficiency only when:

- one owner defines how it is derived;
- invalidation is deterministic;
- callers cannot mutate the cache as a competing truth;
- the debugger can still explain its relationship to the authority.

## Subscribers

### Subscription versus dependency

These terms are related but not identical:

| Concept              | Meaning                                                   |
| -------------------- | --------------------------------------------------------- |
| dependency           | semantic input required to calculate/evaluate something   |
| subscription         | runtime consumer currently listening for relevant changes |
| subscriber telemetry | debugger-visible accounting of those live subscriptions   |
| watchable            | node capability indicating participation in observation   |

An expression may compile to several dependencies. A runtime component then subscribes so it can react when those dependencies change.

### Subscriber registration

The browser CTX runtime can track one path, several paths, or `*` for a whole-CTX consumer. A registration also carries a semantic `kind` and optional label. Registration returns an unsubscribe function; lifecycle owners must call it when the consumer is disposed.

Conceptually:

```text
subscribe
+-- paths[]
+-- kind          expression | runtime | debugger | ...
+-- label         human-readable purpose
+-- unsubscribe() lifecycle cleanup
```

Failing to unsubscribe is both a memory/lifecycle defect and misleading debugger telemetry.

## Subscriber telemetry

Telemetry lives **beside** CTX application values rather than inside the value tree. It describes runtime interest without polluting business/runtime facts.

For a selected node the Viewer can report:

```text
Subscribers
+-- direct       subscriptions to this exact path
+-- dependent    subscriptions to an ancestor/descendant overlapping path
+-- global       whole-CTX (`*`) listeners
+-- total        direct + dependent + global
+-- kinds        counts grouped by semantic subscriber kind
```

### Direct

A direct subscriber registered the selected canonical path itself. If the selected node is `...fields.firstName.value`, a calculation listening exactly there contributes to `direct`.

### Dependent

A dependent subscriber registered an overlapping ancestor or descendant. This is useful for structural consumers that deliberately observe a container or a narrower member of the selected container.

### Global

A global subscriber registered `*`. Examples include runtime-wide consumers that need to observe arbitrary CTX changes. Global listeners are powerful but broad; prefer precise paths when a component knows its real dependency.

### Total and kinds

`total` answers “how many currently registered consumers overlap this node?” `kinds` answers “what sort of consumers are they?” These are live runtime diagnostics, not persisted CTX state.

### `watchable` is not a subscriber count

`watchable = yes` means the node supports observation. It can be watchable with zero current subscribers. Conversely, `subscribers.total = 5` means five registered consumers currently care about changes overlapping that node.

## Event and dependency design rules

Use these rules when adding runtime behavior:

1. **Mutate the authority, not a projection.** If a value is derived, change its source.
2. **Use canonical CTX paths.** Do not bind expression logic to DOM selectors.
3. **Declare the narrowest real dependencies.** Avoid `*` or whole-container dependencies without a reason.
4. **Keep calculations side-effect-free.** A calculation returns a value; commands perform effects.
5. **Re-enter the same mutation semantics for calculated writes.** No private “calculation changed” state channel.
6. **Preserve causal identity through cascades.** Debugging should be able to connect downstream changes to the initiating event.
7. **Dispose subscriptions with their owner.** Popup/surface closure must not leave ghost subscribers.
8. **Do not copy ancestor state into children just to observe it.** Use owner-qualified paths.
9. **Do not introduce a second event system for a component.** If the common mechanism is insufficient, improve the common mechanism.
10. **Treat telemetry as observation, never authority.** Subscriber counts must not drive business decisions.

## Practical metadata example

Suppose `fullName` is calculated from `firstName` and `lastName`, and a summary is visible only when `fullName` is non-empty.

```text
fields.firstName.value -----+
                            +--> fullName calculation --> fields.fullName.value
fields.lastName.value ------+                              |
                                                           v
                                                  summary visibility
```

The useful properties of this graph are:

- the user edits only authoritative input fields;
- the full-name calculation declares both inputs;
- its calculated write uses the same field mutation semantics;
- summary presentation depends on the calculated field, not on the DOM;
- one first-name edit can be followed through a single causal chain;
- the CTX Viewer can show that the first-name node has interested subscribers.

## Component developer usage

A component should first decide what it owns. If it owns a canonical value, it may mutate that value through CTX. If it merely displays a value, it subscribes/depends on the owner's path and never writes a local copy merely for synchronization.

Lifecycle pattern:

```text
component mounts
   |
   +-- read canonical CTX
   +-- register dependency/subscription
   +-- render

CTX changes
   |
   +-- determine relevance
   +-- reread/evaluate
   +-- render

component disposes
   |
   +-- unsubscribe
```

This is especially important for nested UI levels: the lifetime of a popup subscriber must be bounded by that popup, while page-level consumers survive only as long as their owning page surface.

## Runtime developer notes

### Browser public event

`manatos:ctx-change` is the public browser notification for CTX mutation. New browser features should prefer the CTX runtime rather than dispatching another semantically equivalent custom event.

### Typed surface events

Typed surface events remain useful inside runtime modules for strongly typed lifecycle/value semantics. They must project the same logical state changes, not establish a competing public context.

### Field updates

The current browser field-update helper also maintains field dirty/aggregate dirty information and reports projection paths such as `entry.current.<key>` as related paths. This is an intermediate implementation detail on the road to the universal CTX mutation mechanism; generic callers should not reproduce this synchronization themselves.

### Dependency matching cost

Dependency matching currently favors correctness and architectural clarity. If future scale requires indexing/trie optimization, that optimization should preserve canonical path semantics rather than changing the metadata contract.

## Debugging and developer usage

The CTX Viewer is intended to answer four different questions:

1. **What is this node?** — path, semantic kind, JavaScript type, attributes and value/children.
2. **Who owns it?** — attributes such as runtime/derived/readonly/mirror help distinguish authority from projection.
3. **Who currently cares about it?** — live subscriber totals and kinds.
4. **Why did dependent behavior change?** — canonical path, related paths and causal event identity connect a mutation to recalculation.

### Reading the selected-node inspector

For a scalar field value you may see information conceptually like:

```text
Path             ctx.ui.level.level.entry.current.firstName
Kind             value
Type             string
Attributes       runtime, derived, readonly, mirror
Watchable        yes
Subscribers      5 (direct 0, dependent 0, global 5)
JavaScript type  string
Value            "Yiannis"
Children         0
```

Interpretation:

- `derived, readonly, mirror` says this path is convenient to read but is not the mutation authority;
- `Watchable: yes` says it participates in observation;
- the subscriber line is a live count, not a static schema property;
- selecting the authoritative `fields.firstName.value` node should expose the corresponding authority-oriented attributes instead.

### Debugging an expression that does not update

Work in this order:

| Step | Question                                                                     |
| ---- | ---------------------------------------------------------------------------- |
| 1    | Is the source value changing at the expected canonical CTX path?             |
| 2    | Does the expression compile with that path as a dependency?                  |
| 3    | Does the selected source node show an appropriate subscriber?                |
| 4    | Does the change event identify that canonical path/causal chain?             |
| 5    | Is the calculation target being written through its owner?                   |
| 6    | Is a cycle/active-target guard preventing recursive re-entry?                |
| 7    | Is the final UI reading CTX, or is stale local/DOM state masking the result? |

### Debugging unexpectedly high subscriber counts

High counts are not automatically defects. Expand the semantic kinds and ask whether the consumers have the correct lifetime. Navigate away or close the owning popup: subscribers owned by that surface should disappear. If counts only increase after repeated opens/closes, investigate missing unsubscribe/disposal logic.

### Debugging a value that appears in two places

Use the attributes. One node should be the authority; another may be marked `derived`, `readonly` or `mirror`. If both are independently writable, that is an architectural defect to resolve rather than document as normal synchronization.

## CTX Viewer visual reference

The live Viewer is itself the authoritative visualization because subscriber counts, active UI levels and values are runtime-specific. A useful inspection workflow is:

```text
CTX tree                       Selected-node details
-------------------------      ------------------------------------
ctx                            Path        ctx....firstName.value
+ company                      Kind        value
+ system                       Type        string
+ entities                     Attributes  runtime, ...
+ user                         Watchable   yes
- ui                           Subscribers 5 (...)
  - level [PAGE/LIST]          Value       "Yiannis"
    - level [PAGE/ENTRY]
      - entry
      - fields
        - firstName  <------ select this node
```

Screenshots in documentation are useful for orientation, but they age quickly as the debugger evolves. We therefore keep the semantic reference above as the stable contract. Once the current CTX Viewer layout is settled, annotated screenshots should be added under this section showing: **(a)** authority vs mirror inspection, **(b)** subscriber telemetry, and **(c)** a calculated-field dependency/cascade. Those screenshots should illustrate this contract rather than define it.

## Architectural checklist

Before accepting a new CTX/event feature, ask:

- Is there exactly one authoritative representation of each mutable fact?
- Is there exactly one intended mutation owner/path?
- Does the feature reuse the CTX change/dependency mechanism?
- Are expression dependencies explicit and canonical?
- Are derived values projections rather than second truths?
- Are subscriptions scoped and disposable?
- Can the CTX Viewer explain the node, ownership and live subscribers?
- Can a developer trace a cascade back to one root cause?

If the answer requires a second representation, second mutation path, second event path or entity-specific runtime special case, the design should be reconsidered before adding machinery.
