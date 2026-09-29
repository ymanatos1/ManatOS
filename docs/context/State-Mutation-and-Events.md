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

| Node                  | Typical owner                    | Writable?                                              |
| --------------------- | -------------------------------- | ------------------------------------------------------ |
| `fields.<key>.value`  | entry field runtime              | yes, subject to field semantics                        |
| `entry.original`      | entry initialization             | no after initialization                                |
| `entry.current`       | field projection                 | derived/read-only projection                           |
| `control.state.dirty` | aggregate entry/surface state    | runtime-derived                                        |
| `facts.*`             | bootstrap/API/runtime fact owner | normally replaced by its owner, not edited by controls |
| `presentation.*`      | surface/presentation runtime     | only through the owning presentation mechanism         |

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

## Current browser runtime contract

The post-consolidation V2 browser has one public semantic CTX mutation/event authority: the browser CTX runtime. Canonical mutations flow through that runtime and publish `manatos:ctx-change`; semantic node descriptions and subscriber telemetry are maintained beside the CTX value tree rather than as application data.

Entry/form modules also use narrowly scoped DOM lifecycle/coordination events such as `manatos:form-initialized`, `manatos:form-initialization-changed`, `manatos:form-initialization-settled`, `manatos:form-baseline-captured` and contributor-state events. These coordinate browser components; they are **not** a second semantic mutation bus and do not create another CTX authority.

The former parallel TypeScript surface-runtime event model has been removed. New functionality must not recreate it or introduce feature-local mutation/dependency systems. Metadata authors should reason in canonical CTX paths and expressions; runtime code should mutate the canonical owner and let the shared CTX event/dependency projection notify consumers.

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

An expression dependency is a canonical CTX path whose change can invalidate an expression result. Compilation produces a context-neutral AST. When an entry runtime binds that AST, it walks the variable nodes and resolves them against the entry's materialized lexical CTX scope using the same variable resolver as evaluation. The resulting canonical paths are registered once for that runtime, so source text is not reparsed on each change.

Example:

```text
fullName calculation
  depends on fields.firstName.value
  depends on fields.lastName.value
```

When either dependency changes, the calculation becomes eligible for reevaluation.

### Binding dependencies to the actual owner

The compiled AST is context-neutral. Browser dependency binding occurs in the owning entry runtime: each variable AST node is resolved through `runtime.resolveVariableWithPath(...)` at that entry's fixed CTX scope. The canonical resolved path is the dependency identity. There is no separate `surface:<id>` dependency namespace and no second dependency projection stored in CTX or metadata.

The entry runtime captures its owning `ctx.ui.level...` path when it starts. A popup/selector opened later may become the topology leaf, but it does not retarget the already-bound parent form's expressions or transaction state.

### Exact and overlapping paths

Dependencies are hierarchical. A change to a descendant can matter to a consumer of an ancestor and vice versa. The dependency runtime therefore considers paths related when they are equal or one is a descendant of the other.

```text
fields.address
fields.address.city
```

A consumer deliberately depending on `fields.address` is interested in a change to `fields.address.city`. Authors should nevertheless choose the narrowest stable dependency that expresses the rule; broad dependencies cause unnecessary reevaluation and make debugging less precise.

### Local, ancestor and root dependencies

Lexical expressions may use concise local names; explicit `$...` references may address root CTX. In both cases the browser binder resolves the variable to its actual canonical CTX path before registration. An expression can therefore depend on legitimate ancestor/root state without copying that state into the child.

The principle is: **resolve/reference the owner; do not duplicate the fact merely to make it locally convenient.** Topology depth describes nesting; it does not transfer ownership.

### Initialization is special but deterministic

An initialized field may equal its original value, so initialization cannot rely on a later CTX change to make derived state correct. The entry runtime therefore performs one deterministic full reactive pass at the `manatos:form-initialized` boundary. Calculated values and UX expressions do not have to wait for the user to edit something before becoming correct.

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

### Loop/runaway protection

The browser reactive scheduler deduplicates queued `(causal event identity, changed path)` work and drains changes serially. It also aborts a drain after more than 512 reactive-entry executions and reports a possible dependency cycle. This is a guard, not permission to design cyclic business rules; metadata should still form understandable, terminating dependency relationships.

### Determinism

For the same authoritative CTX state and same side-effect-free expression, calculation results should be deterministic. Clock access, entity resolution and other capabilities are explicit precisely because they change what an expression needs from its execution host.

## Derived state and projections

Derived values should be computed from authoritative state instead of independently synchronized whenever practical:

```text
field dirty    = fields.<key>.value vs fields.<key>.originalValue
entry.current  = projection of fields[*].value
visual changed = projection of fields[*].dirty
surface dirty  = aggregate owned dirty state
```

The browser metadata-entry shell now separates those sources directly. Canonical entity fields
contribute through the read-only `fields.<key>.dirty` projections. Non-CTX workflows own their own
reversible comparison and register only aggregate contributor facts with the entry shell. The shell
never serializes or inspects their private values. Sensitive provider credential transaction values
and committed related-collection payloads therefore remain with their owning components, while CSRF
values, popup tokens and ordinary canonical field controls cannot accidentally become dirty-state
authorities.

Navigation protection and Save enablement consume the same combined predicate: canonical field dirty
OR explicit contributor dirty. Provider/entity-specific pending-dirty latches remain forbidden; each
component owns its baseline and validity semantics while the generic shell owns only contributor
registration. Reduction of contributor facts (`dirty`, `valid`, `blocked`, `blockingCount`) is one pure
`@manatos/shared` policy consumed by the browser entry shell; browser code does not reimplement those
predicates. Canonical-field validity is evaluated independently from contributor validity before both
feed the shared aggregate policy.

The browser shell keeps a private per-entry contributor registry: contributors report only `dirty`,
`valid`, and `blocksPersistence`. Components do not receive the registry or a mutable form-state handle. They
register an owned contributor through the generic `manatos:form-contributor-register` event, and the
entry shell keeps the contributor map entirely inside its runtime closure. `manatos:form-state-ready`
exists only as a script-order handshake so components rendered before the shell can replay registration;
`manatos:form-contributor-state` asks the shell to recompute after an already-registered contributor's
private state changes. Contributor ownership lasts for the owning form runtime lifetime; there is no
separate contributor-removal event because current contributors are form/component scoped and disappear
with that runtime. A related collection owns one contributor for both its committed-value dirtiness
and its active-draft blocking, so no parallel child-editor DOM/event state is required. Contributor
identities and counts are runtime bookkeeping and never become semantic CTX. The owning entry exposes
only the aggregate `control.state.dirty`, `control.state.valid`, and `control.state.blocked` facts. Browser/runtime code uses the
same `blocked` / `blockingCount` vocabulary internally; the retired `internalEditing` /
`internalEditorCount` terminology must not reappear.

Retryable application-error actions use the semantic `data-popup-action="retry"` popup contract. The popup
runtime emits a cancelable `manatos:retry-request`; the owning entry runtime handles it locally when
appropriate, otherwise the popup runtime falls back to reloading the page. Retry ownership is therefore
not exposed through a mutable `window` callback.

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
+-- registrations matching subscriber labels, kinds and registered paths
```

### Direct

A direct subscriber registered the selected canonical path itself. If the selected node is `...fields.firstName.value`, a calculation listening exactly there contributes to `direct`.

### Dependent

A dependent subscriber registered an overlapping ancestor or descendant. This is useful for structural consumers that deliberately observe a container or a narrower member of the selected container.

### Global

A global subscriber registered `*`. Examples include runtime-wide consumers that need to observe arbitrary CTX changes. Global listeners are powerful but broad; prefer precise paths when a component knows its real dependency.

### Total and kinds

`total` answers “how many currently registered consumers overlap this node?” `kinds` answers “what sort of consumers are they?” `registrations` explains **which** matching consumers produced those counts, using their diagnostic label, semantic kind and registered canonical paths. The CTX Viewer exposes this as **Subscriber details** so an unexpectedly high count can be traced to concrete runtime consumers rather than guessed from a number. These are live runtime diagnostics, not persisted CTX state. The CTX Viewer may persist **inspection coordinates** such as selected/expanded paths, Properties layout, history and a watched path in browser-local developer-workspace state, but it never persists the semantic CTX values or subscriber registry themselves. A later page resolves a missing selected path to the nearest surviving parent.

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

This is especially important for nested UI levels: the lifetime of a popup or embedded subscriber must be bounded by its owning child level, while page-level consumers survive only as long as their owning page surface.

## Runtime developer notes

### Browser public event

`manatos:ctx-change` is the public browser notification for CTX mutation. New browser features should prefer the CTX runtime rather than dispatching another semantically equivalent custom event.

### Typed surface events

Typed surface events remain useful inside runtime modules for strongly typed lifecycle/value semantics. They must project the same logical state changes, not establish a competing public context.

### Field updates

Browser entry-field writes use the canonical field-mutation boundary (`updateField` in the current browser runtime). User input, calculated values and metadata/default policy writes all enter through that boundary. It owns the semantic update of `fields.<key>.value`, selected option decoration, dirty/aggregate state, related record projections such as `entry.current.<key>`, dependency notification and causal provenance. Generic callers must not reproduce those effects with direct `replace()` calls, DOM-derived semantic metadata or synthetic change events.

The DOM remains a legitimate input/presentation boundary: a native control may provide the raw value of a user edit and may be updated to display a programmatic CTX value. It is not an evaluator scope, field-state store or option-catalogue authority.

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

## Canonical reactive dependency matching

Expression dependencies are resolved against their lexical CTX owner before registration. The resulting **canonical CTX path** is the dependency identity; the runtime does not create a second owner-qualified `surface:<id>` namespace.

The browser entry scheduler consumes the canonical `manatos:ctx-change` event stream. For each event it queues the emitted `path` plus any `relatedPaths`, deduplicates `(root/event identity, changed path)` with the shared `reactiveChangeQueueKey(...)` policy, and compares changed paths with registered dependency paths using `reactivePathsOverlap(...)`. That shared ancestor/descendant rule means replacing a containing semantic node invalidates dependencies below it, while a descendant mutation can invalidate a dependency on the containing node.

`relatedPaths` are projections of the **same semantic mutation**, not additional authorities or alternate dependency identities. For example, changing `fields.<field>.value` can also identify the read-only `entry.current.<field>` projection as related. Calculations, validation and declarative presentation state consume this one canonical event/dependency model rather than maintaining feature-specific owner/path matching algorithms. The scheduler deduplicates work at the event boundary so one affected calculation is not rerun merely because several related paths from the same mutation overlap its dependencies. Initialization similarly evaluates each registered calculation through the normal scheduling model rather than manufacturing synthetic surface-qualified paths.
