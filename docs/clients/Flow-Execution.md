# Flow Execution and Orchestration

A **Flow** coordinates a multi-step operation while leaving visual surface ownership and API authority in their respective layers. Authentication provides concrete examples: signing in, registering, resetting a password and changing a password combine user input, server requests and conditional transitions.

## A separate runtime context

The UI surface tree is nested at `ctx.ui.level.level...`. The Flow runner publishes one active Flow at `ctx.flow`. Its `control` includes a name, instance identity, status and a pointer to the current step. The `steps` map holds named step contexts; child steps are nested under their parent step. These are **execution states**, not modal/dialog objects.

```text
ctx
├─ ui
│  └─ level → popup or other visible surface
└─ flow
   ├─ control → name, instanceId, status, currentStep(pointer)
   └─ steps
      └─ credentials
         ├─ control → status, startedAt, endedAt, error
         ├─ data
         └─ steps → optional named substeps
```

The implementation in `shared.UI/src/flows/flowRunner.ts` defines `FlowStepDefinition`, `UiFlow`, `FlowExecution`, `FlowContext` and `FlowRunner`. Recognized step statuses are `pending`, `running`, `waiting`, `completed`, `failed` and `cancelled`. A Flow factory is registered by name and supplies step definitions; the runner owns dispatch, state transitions and lifetime.

## Control and authority

The Flow defines the operation's sequence. A surface requests an action or emits an event. An API service decides whether an authenticated/authorized operation succeeds. Neither a surface's visible state nor a Flow's completed status is independently proof that a remote operation succeeded; the result must come from its authoritative boundary.

The `surfaceFlow(stepPath, events)` binding links a surface to a Flow step without copying that step into the UI context. A current-step pointer similarly identifies the canonical step instead of maintaining a second mutable step record.

### Lifecycle conditions

- Flow identifiers and step identifiers are validated before becoming CTX paths.
- A runner must prevent overlapping execution from silently corrupting the single active Flow context.
- Disposal and asynchronous completion must not resurrect disposed execution state.
- Input or API failure must be represented in the owning step; presentation determines how to display the error.
- The Flow must not stash passwords or raw OAuth secrets into observable CTX merely because CTX is convenient to inspect.

## Authentication examples

The shared implementation contains `SignInFlow`, `RegisterFlow`, `ResetPasswordFlow` and `ChangePasswordFlow`. These demonstrate orchestration independent of how NG1 and EJS1 present the same operations. Host-specific credentials and session integration remain at the trusted host/API boundary.

Other multi-step operations may use the same model where they genuinely need controlled step transitions. A simple button click need not become a Flow; its semantics may be entirely covered by a component action.

## Verification

Verify step order, nested step identity, failure transitions, cancellation, repeated invocation, asynchronous completion after disposal and event-to-step bindings. Inspect Flow state through diagnostics without treating sensitive transport payloads as safe to expose.

See [UIS Architecture](UIS-Architecture.md), [Security Architecture](../security/Security-Architecture.md) and [CTX Architecture](../context/Context-Architecture.md).
