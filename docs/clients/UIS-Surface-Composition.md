# UIS Surface Composition and Integration

UIS gives independent host technologies a common model for *what an interactive surface means*, while leaving the host free to decide how it renders. The central abstraction is not a shared DOM component: it is a **semantic ownership contract** combining a CTX level, state, layout, data, components, lifecycle and explicit user intentions.

This document focuses on how surfaces are composed and integrated. [UIS Architecture](UIS-Architecture.md) supplies the overall topology; [Components and Ownership](UIS-Component-Contracts.md) defines component-level responsibilities; [UI Surfaces and Levels](UI-Surfaces-and-Levels.md) supplies the level model.

## 1. Surface ownership versus content

```text
                  UIS surface host
              ctx.ui.level[.level...]
                ┌──────┴──────┐
         lifecycle owner   content runtime
         identity/cleanup  List / Entry / Popup
                │             │
                └──────┬──────┘
                       ▼
            #control  #state  #layout  #data
                       │
               semantic components
                       │
               rendering adapter
```

The generic `UiSurfaceHostRuntime` in `shared.UI/src/runtime/surface/host-runtime.ts` creates exactly one child `level` under `ctx.ui` or an active parent level. It validates the parent, requires the four namespaces to exist, registers semantic roles before publishing and rejects a second owner at the same path.

Its job is deliberately narrow: it does **not** own DOM elements, content templates, route handlers, individual tabs, business fields, authentication or API policy. `UiHostLevelRuntime` and content runtimes compose more specialized behavior on top of this owner.

An Entry may be hosted in a Page or Popup without becoming two independent Entry implementations. Its content owns editing semantics; its surface host owns level lifecycle; the adapter owns modal or page presentation. This is the mechanism that makes the same interaction contract reusable across several clients.

## 2. The level contract

| Namespace | Meaning | Typical facts |
|---|---|---|
| `#control` | Surface identity, kind, host and invocation | `instanceId`, `kind`, parent/return information |
| `#state` | Observable interaction state | mode, active tab, saving, dirty, selections |
| `#layout` | Owned semantic composition | embedded components, columns, fields, tools |
| `#data` | Runtime facts and working values | record baseline/current, references, resolved resources |

The order of declaration matters for intelligible CTX inspection. The host publishes a fully initialized level, not a half-created tree to which observers must react defensively. Child components contribute within the parent's declared layout structure rather than inventing unrelated global state branches.

```text
ctx.ui
└─ level  (Entry)
   ├─ #control
   ├─ #state
   │  └─ entry / fields
   ├─ #layout
   │  └─ Entry → Tab → FormField → typed field
   ├─ #data
   │  ├─ original
   │  ├─ current
   │  └─ references
   └─ level  (Reference List popup)
      ├─ #control
      ├─ #state
      ├─ #layout
      └─ #data
```

The nested popup is a child semantic level, not a second root page, a second Entry value store, or a Flow step. An invocation/result contract transfers the chosen reference identity back to the invoking field.

## 3. Lifecycle invariants

A surface must be constructed atomically and disposed safely. A parent with an active child cannot be disposed by mistake; the child must close or explicitly resolve first. Disposal checks instance ownership, so delayed cleanup from a previously closed surface cannot delete a new surface that has reused its CTX path.

These guarantees are visible in `UiSurfaceHostRuntime` and are independent of how Angular/EJS components mount, unmount or schedule change detection. UI adapters must respect that lifecycle rather than treating DOM removal as the only cleanup action.

Surface identity also matters for asynchronous resources. Data loaded for an outdated Entry instance must not overwrite a replacement surface. The Entry content runtime uses request/edit versions and a disposed guard for this reason. Resource transport is supplied by an explicit port; the semantic content does not silently reach into an arbitrary browser API.

## 4. List composition and selection

A List includes an entity identity, resolved columns, query state and optional selection contract. Its query can include paging, filtering, sorting and a search field determined from canonical entry representation or primary field. The List is more than an HTML table, because its state and actions must be meaningful in both full-page and popup contexts.

```text
Entity metadata + named List view
                 │
            List runtime
       query / columns / selection
                 │
            resource port
                 │
       API-authorized collection
                 │
          List representation
         page / selector popup
```

A reference selector reuses these collection semantics while adding selection result handling. Related collection views and ordinary lists use the same underlying entity definition; the selector cannot manufacture additional read permission because it opened from a writable parent Entry.

## 5. Entry composition and edit state

The Entry content runtime resolves metadata and a record resource, then represents the record's baseline and editable working values through `#data.original` and `#data.current`. Read-only/view mode, saving state, field validity and dirty state are derived from the canonical Entry state, not the DOM's incidental input values.

An edit follows one authority path:

```text
User input (NG/EJS adapter)
           │
     typed field intent
           │
   Entry content setField()
           │
    update #data.current
           │
derive validation + dirty state
           │
reactive layout / field projection
           │
     optional API commit
```

This separation prevents a field component from bypassing normalization and validation by directly editing a page-local object. The present adapter behavior and exact source paths must be checked for individual fields, because component migration and parity are not guaranteed merely by the existence of the common field registry.

The Entry's source-backed namespaces include `#state.fields`, `#state.entry`, `#data.original`, `#data.current`, `#data.references` and `#data.imageVariants`. Canonical field definitions and UI Views influence layout/presentation; they do not create an independent second business record.

## 6. Field composition and typed responsibility

A generic FormField host contributes standard structure, labels, common tools and dispatch; a typed field owns its type-specific behavior contract. For example, an option field should resolve either inline options or subsystem enums through one mechanism, then store the canonical selected value. A ReferenceField should store a stable referenced identity, not a rendered name. A PictureField has both descriptor/presentation information and binary-resource transport requirements.

FormField composition must make it possible to inspect who owns each action and layout node. Reusing common behavior is preferable to large type switches in generic hosts, but actual source migration state and feature completeness must not be overstated.

Read [Field Components](../entities/Field-Components-Detail.md) and [Fields](../entities/Fields.md) for the canonical field/type definitions.

## 7. Flows are not surfaces

`FlowRunner` owns a single `ctx.flow` context with step status and the current-step pointer. A Flow may open or coordinate a UI surface, but the lifetime of the Flow step is not the same as the lifetime of that surface. The same authentication Flow can coordinate server workflows and popups without making popup tabs into separate Flow instances.

```text
ctx.flow.steps.signIn (FlowRunner)
       │ opens / awaits
       ▼
ctx.ui.level (Sign-in popup)
       │ emits action/result
       ▼
Flow step transitions
```

See [Flow Execution](Flow-Execution.md) and [UI Flows](UI-Flows.md).

## 8. Adapter responsibilities

| Shared semantic runtime | Angular/EJS presentation adapter |
|---|---|
| Entry/List/Popup identity, state and actions | Concrete component/template and event wiring |
| Canonical `#layout` and embedded components | DOM insertion, structural placeholders and CSS |
| User-action requests and resulting state | Input mapping, click/keyboard behavior |
| Resource-port contracts and async state | Host-side authenticated transport adapter |
| Language-neutral labels and data | Localized text and accessible labels |
| Surface disposal contract | Focus restoration, modal stacking, scroll and window effects |

A new adapter technology can reuse semantic contracts rather than redesigning entity handling. That portability does not imply that all adapters have identical feature completeness or that native implementation internals belong in this TypeScript reference.

## 9. Verification

For each interactive feature, verification should follow the full path: **metadata → semantic component → CTX state → NG/EJS template → event → semantic action → resource/API → resulting state**. For nested popups, also test child lifecycle and return values. For forms, test read-only policy, dirty/valid/saving projection, localization, focus and errors. For typed fields, verify option/reference/picture semantics against source rather than relying on cosmetic parity.

The framework makes these responsibilities explicit; it does not eliminate the requirement to test them in the actual client.

## Related references

[UIS Architecture](UIS-Architecture.md) · [UIS Components](UIS-Component-Contracts.md) · [UI Surfaces and Levels](UI-Surfaces-and-Levels.md) · [Flow Execution](Flow-Execution.md) · [Entry Forms](../entities/Entity-Entries-Forms-Detail.md) · [Named UI Views](../metadata/UI-Views.md).
