# Working with Entity Lists and Entries

## Purpose

This guide is the authoritative structural reference for metadata-driven SysBO **list pages, entry pages and the existing-record selector page surface**. These surfaces are driven by canonical BO metadata, UI metadata and CTX; entity-specific templates must not recreate field, reference, representation or query semantics.

## End-to-end page model

```text
[M] Canonical BO metadata
[C] CTX + evaluator
[U] UI metadata
[L] List page
[E] Entry page
[S] Existing-record selector
[A] API/domain/storage

Flow:
  M --> C
  U --> C
  C --> L
  L --[open/add]--> E
  E --[reference tools]--> S
  S --[selected canonical entry]--> E
  E --[save/delete]--> A
  A --> C
```

## 1. List page

### Presentation structure

```text
Entity list page
├── breadcrumb / page title + canonical entity icon
├── page actions
├── count
├── Filters
├── Search
├── table
│   ├── metadata-defined columns
│   ├── canonical value / entry representation
│   └── row actions
└── paging / rows-per-page
```

### Important CTX structure

```text
ctx.ui
└── level                         # owning list UI level
    ├── control (name / kind / mode / invocation / presentation / state / facts)        # list surface identity
    ├── list
    │   ├── originalEntries[]     # baseline list projection when meaningful
    │   └── entries[]             # current projected list records
    ├── filters / search / paging # collection query state
    └── state                     # list-surface runtime state
```

List filtering/search/sorting is a query contract, not a browser-only rendering concern. Structured exception expressions must remain canonical so a future RDBMS adapter can translate them to storage predicates.

### Calling example

Opening `/bo/sys-principals` loads the Principal BO/UI metadata, projects the declared list fields (`parentId`, `rootPrincipalId`, `name`, `principalType`, `enabled`) and renders all reference values through the same entity-aware entry representation resolver used by selectors and related collections.

## 2. Entry page

### Presentation structure

```text
Entity entry page
├── breadcrumb
├── title = Create/Edit + canonical entry representation
├── metadata-defined tabs
│   ├── form fields
│   ├── summary fields
│   ├── related collections
│   └── reusable components
└── entry actions
    ├── Delete
    ├── Close / Cancel
    └── Save / Save and Close
```

The first visible editable field in the first editable tab receives initial focus. This is determined from rendered metadata order after reactive visibility/editability initialization; no entity-specific autofocus rule is required.

### Important CTX structure

```text
ctx.ui
└── level                         # list or other parent level
    └── level                     # entry UI level
        ├── control (name / kind / mode / invocation / presentation / state / facts)
        ├── fields
        │   └── <fieldKey>
        │       ├── value         # sole live scalar authority
        │       ├── originalValue # sole scalar baseline authority
        │       └── dirty         # derived from value vs baseline
        ├── entry
        │   ├── current           # read-only record mirror of field values
        │   └── original          # read-only record mirror of baselines
        ├── component/resource state
        └── state                 # aggregate form/workspace state
            ├── dirty
            ├── valid
            ├── saving
            └── deleting
```

### Field and calculation example: Person Principal

Principal keeps the canonical persisted `name` field but presents it as **Full name**. For `principalType == 'Person'`, `firstName` and `lastName` are visible and editable while `name` becomes read-only and is evaluator-calculated/materialized from those fields. For non-Person principals, first/last names are hidden and `name` is directly editable.

```text
Principal type        Enabled
First name            Last name       # Person only
Full name             User            # User Person only; Full name readonly for Person
Description                           # full row
Parent principal      Root principal
```

Because `Principal type` is the first control, it receives initial focus and its CTX value can drive the visibility/editability of all following fields before the user reaches them.

## 3. Existing-record selector page surface

The selector is popup-hosted, but it is documented here because it is an entity browse/select surface that deliberately reuses list-page metadata, canonical entry presentation, filters, search and paging. Popup hosting/lifecycle details are in [`../design/Components.md`](../design/Components.md).

### Presentation structure

```text
Record selector
├── title derived from caller/presentation policy
├── Filters
├── Search
├── canonical entity table
│   ├── same list columns
│   ├── same reference formatting/icons/names
│   └── candidate availability/selection state
├── paging
├── context note
└── Cancel / Select
```

A selector must never have a second answer for "what is this entry called?". Entity-aware canonical entry representation is the single holder of truth for list rows, reference fields, selectors, hierarchy selectors and related collections.

### Important CTX structure

```text
ctx.ui
└── ... level                     # caller surface
    └── level                     # selector surface
        ├── kind = "record-selector"
        ├── invocation
        │   ├── entityName
        │   ├── purpose = "select"
        │   ├── caller?
        │   │   ├── surfaceRef
        │   │   ├── entityName?
        │   │   └── recordId?
        │   ├── presentation?
        │   ├── rules?
        │   │   ├── values
        │   │   ├── fields
        │   │   ├── query
        │   │   └── actions
        │   └── behavior?
        ├── presentation
        ├── list
        │   ├── originalEntries[]
        │   └── entries[]
        ├── selector-local working state
        ├── filters / search / paging
        ├── selectedId / selectedIds[]
        └── state
```

`invocation.rules.query` carries canonical query restrictions in a generic form. Expression-bearing restrictions carry authored expression source only; the browser resolves ASTs lazily through the canonical expression runtime and never stores AST objects in semantic CTX or invocation state. Relationship-specific concepts such as hierarchy placement or uniqueness are translated by the caller into those generic restrictions before the selector opens.

### Reference-field call example

```text
User(Admin).principalId
  -> field tools / Select existing entry...
  -> caller creates SurfaceInvocation
       entityName = SysBOPrincipal
       purpose = select
       caller.surfaceRef = <User entry surface>
       rules.query = <generic candidate restrictions>
       behavior = <generic selector behavior>
  -> selector returns selected Principal record
  -> caller-side continuation knows target field principalId
  -> reference field value + CTX update
  -> ordinary Save transaction
```

The child selector never receives `targetField` as part of its semantic invocation. The destination belongs to the caller's continuation state.

### Hierarchy call example

```text
Organization workspace / Add existing entry...
  -> caller creates SurfaceInvocation
       entityName = SysBOPrincipal
       purpose = select
       caller.surfaceRef = <Organization surface>
       rules.query = <generic hierarchy eligibility restriction>
  -> selector returns selected Principal record
  -> Organization continuation applies sibling/child placement
  -> hierarchy draft relation
  -> Commit
```

## Current reference entities

### Users

Users model ordinary editable text/contact fields, metadata-driven enum selection, calculated/readonly fields, the optional one-to-one Principal reference, authentication summary content and external identities.

### Principals

Principals are the strongest reference/reference-field and hierarchy model. Their General tab demonstrates conditional field visibility/editability, an assisted persisted Full-name calculation, inverse one-to-one User reference selection, editable Parent and calculated Root references, and initial focus driven entirely by metadata order.

### Applications

Applications are the compact baseline SysBO model and demonstrate straightforward metadata-driven entry/list behavior plus related Licenses.

### Licenses

Licenses demonstrate reference, enum, numeric, date, duration and version-like structured field presentation. The Contents tab is the model for date-duration composition and reference selection to Applications.

## Responsibility checklist for new entity surfaces

A new entity should normally require metadata, not a new renderer. Before adding entity-specific code, confirm that the requirement cannot be expressed by canonical field metadata, UI layout metadata, evaluator-backed visibility/editability/calculation, canonical entry representation, generic query predicates, or a reusable component.

Red flags include entity-specific reference formatting, selector-side ID/name maps, browser reparsing of expressions, duplicated list columns for popup selectors, or hard-coded field names in generic components.

## Hosted entity-entry popup

The metadata-driven entry renderer is host-neutral. The same entity entry that is reached from a
list page can also be hosted inside a modal popup; the popup does **not** own a second form renderer.
It loads the canonical `/bo/<entity>/new` or `/bo/<entity>/<id>` route in an embedded entry host and
therefore reuses the same tabs, fields, evaluator rules, CTX construction, validation, save path and
entry representation.

Popup completion is returned to callers as one canonical surface-result envelope (`outcome`, `value`, `record`, and `metadata`). Callers do not receive or depend on the transport `postMessage` payload as a parallel compatibility result.

### Invocation layering

A caller may supply a canonical `SurfaceInvocation` in addition to canonical entity/UI metadata. Effective field behavior is resolved in one direction:

```text
canonical BO metadata
        +
canonical UI metadata
        +
SurfaceInvocation.rules
        +
normal mode + authorization rules
        =
effective hosted entry
```

`rules.values.<field>.default` seeds create-mode values while leaving them editable. `rules.values.<field>.fixed` expresses a caller-imposed fixed value; `rules.fields` supplies generic field behavior restrictions, and field-domain restrictions such as allowed enum values belong there rather than in relationship-specific parameters.

A reference field may declare `referenceSelection.createRelated` metadata. The caller-side reference runtime translates that relationship declaration into the generic invocation contract rather than teaching the hosted entry about Users, Principals or any other concrete relationship. For the User -> Person Principal identity relationship, that translation can seed First/Last name, fix the inverse User field to the calling User, and restrict Principal type to Person. Full name is still calculated by ordinary Principal metadata.

### Create-related sequence

```text
Parent entry / reference-select
        |
        | Add entry...
        v
Entry popup (mode=create)
        |
        | canonical target entry renderer
        | + caller defaults / UI overrides
        v
POST canonical target /save
        |
        | create succeeds
        v
popup result { entityKey, id, record, representation }
        |
        v
calling reference-select inserts/reloads candidate,
selects it and marks parent form dirty
```

Cancel or a failed create never changes the calling reference field. A successful target create is
real persistence; in a one-to-one inverse relationship such as User <-> Principal, saving the new
Principal with its fixed User field establishes the relationship transactionally. The caller then
refreshes/selects the returned Principal as presentation state; it does not create the relationship a
second time.

### Existing-entry view popup

The same host supports existing records. A hierarchy visualization can open a node with
`mode:'view'`; the canonical entry renderer then applies global view-mode readonly behavior over the
entity's normal UI metadata. This is intentionally the same entry surface, not a hierarchy-specific
Principal viewer.

### Popup CTX

A popup is only one possible **container** for a hosted surface. The hosted entry owns its normal canonical CTX and receives the same host-neutral `SurfaceInvocation` contract used by first-level and nested pages.

```text
ctx.ui
└── ... level                     # caller surface
    └── level                     # outer popup host/provenance surface
        ├── host = "popup"
        ├── kind = "entry"
        ├── invocation
        │   ├── entityName
        │   ├── purpose = view | create | inspect
        │   ├── caller?
        │   ├── presentation?
        │   ├── rules?
        │   └── behavior?
        ├── presentation
        └── state.popup           # host geometry/lifecycle only

hosted iframe ctx.ui.level       # sole owner of live entry semantics
├── entry
├── fields
├── facts
└── state                         # entry lifecycle/validation/etc.
```

Navigation hierarchy, popup nesting and semantic ownership are separate concerns. The child does not receive a parent `targetField` or parent mutation instruction; the caller keeps the continuation that decides what to do with the returned create/update/view result.

### Hosted-entry interaction rules

Hosted metadata entries follow the same popup contract as every other ManatOS popup. In developer
mode the popup header exposes the standard **CTX** inspection action for the outer popup host/provenance
surface. The hosted iframe retains sole ownership of its live entry CTX; the parent does not mirror
`entry`, `fields`, `facts` or entry lifecycle state into the outer surface. The host sizes itself
from the embedded entry's live content and remeasures after tab/layout changes, subject to viewport
limits; short tabs therefore do not inherit a permanently tall dialog.

Reference creation is a capability of the generic reference field, not a relationship-specific
feature. Every editable reference whose target entity is known can offer **Add entry...**.
`referenceSelection.createRelated` remains optional metadata that supplies relationship-specific
caller defaults, fixed values, or UI constraints when those are required.

Caller-supplied entry defaults are field assignments. On hosted-entry initialization they are
published through the same CTX field-update/event pipeline as interactive and other programmatic
changes, so calculated fields and evaluator-driven UI properties react regardless of how the source
field obtained its value.

A hosted entry is currently a single child-interaction boundary: opening another hosted full-entry
popup from inside it is deliberately suppressed. This prevents recursive iframe/modal ownership,
focus, CTX and close-state ambiguity. Nested lightweight editors inside the entry remain independent
of this restriction.
