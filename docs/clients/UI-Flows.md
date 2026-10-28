# UI Flows

## Purpose

This guide documents the **supported end-to-end UI flows** that exercise the page, form, field-component, composite-component and system-surface architecture described elsewhere under `docs/clients/`.

It is intentionally flow-oriented: each section answers **which screens participate, what owns each step, where state lives, and which reusable UI contracts are involved**. Use it together with:

- [`Client-Architecture.md`](Client-Architecture.md) for architectural boundaries and invariants;
- [`Entity-Entries-Forms-Detail.md`](../entities/Entity-Entries-Forms-Detail.md) for form lifecycle, dirtiness, validation and Save/Close behavior;
- [`Field-Components-Detail.md`](../entities/Field-Components-Detail.md) for canonical field rendering and field tools;
- [`Components.md`](../entities/Components.md) for reusable non-field widgets and collections;
- [`Composite-Components.md`](../entities/Composite-Components.md) for multi-field/content composition;
- [`Entity-Entries.md`](../entities/Entity-Entries.md) for current metadata-driven entity page models;
- [`../system/System-and-Account-Pages.md`](../system/System-and-Account-Pages.md) for authentication, account, configuration and developer/system surfaces.

## Flow map

```text
[ANON] Anonymous visitor
[AUTH] Authenticated session
[ADMIN] Administrative workspace
[ACCOUNT] Account details
[BO] metadata-driven entity list / entry
[PROVIDER] External provider administration
[ORG] Principal organization workspace
[REL] Related-entry editors
[DEV] CTX / Debugging / API Traffic

Flow:
  ANON --[Sign in / Sign up / external provider]--> AUTH
  AUTH --> ACCOUNT
  AUTH --> BO
  AUTH --> DEV
  ADMIN --> PROVIDER
  BO --> ORG
  BO --> REL
  PROVIDER --> AUTH
```

The flows share one important rule: **page/workflow state may differ, but canonical entity fields always retain the same field-component semantics**. A reference does not gain a second renderer because it was calculated; an enum does not gain an entity-specific menu because it appears in a special workflow.

---

## 1. Local authentication flow

### Screens and components

```text
Participants: U=User | SI=Sign-in surface (NG1/EJS1 popup; EJS0 page) | UI=UI host | API=API auth endpoints | S=Browser session | W=Authenticated workspace

 1. U --> SI  Enter user name/email + password
 2. SI --> UI  Submit credentials through host-owned authentication workflow
 3. UI --> API  Authenticate credentials
 4. API --> UI  Auth result/session material
 5. UI --> S  Establish browser/API session
 6. UI --> U  Resolve Flow and refresh authenticated UI state/navigation
 7. U --> W  Navigate with session context
```

The authentication UI is a **system/authentication surface**, not a metadata-driven entity entry form. NG1/EJS1 present `SignInPopup` through the shared surface/Flow contracts; EJS0 retains its separate page-oriented authentication implementation. Password visibility and password-policy behavior belong to reusable system/form infrastructure, not to SysBO field components. See [`../system/System-and-Account-Pages.md`](../system/System-and-Account-Pages.md) and the system-input guidance in [`Components.md`](../entities/Components.md).

### Responsibilities

- **Sign-in surface**: NG1/EJS1 popup captures credentials and delegates decisions to the owning authentication Flow; EJS0 uses its distinct system page.
- **UI authentication route/session layer**: orchestrates browser-session establishment.
- **API**: remains authoritative for authentication/security decisions.
- **Application shell**: changes anonymous actions into authenticated navigation/account actions after session establishment.

---

## 2. Registration and verification flow

```text
[A] Sign up
[B] Registration form
[C] API account creation
[D] Verification-required state
[E] Email verification
[F] Sign in
[G] Authenticated workspace

Flow:
  A --> B
  B --> C
  C --> D
  D --> E
  E --> F
  F --> G
```

NG1/EJS1 registration uses shared popup/Flow components and host-owned account workflows; EJS0 retains its separate page/form presentation. Registration uses shared password-policy behavior. The resulting SysUser later appears through the normal metadata-driven Users administration pages; **registration UI and SysUser administration are different presentation/workflow layers over related business data**.

For the metadata-driven User entry model, see [`../company/Users-and-Principals.md`](../company/Users-and-Principals.md).

---

## 3. External authentication flow

### User-facing provider sign-in

```text
Participants: U=User | SI=Sign-in / Sign-up | UI=UI external-auth route | P=External provider | API=ManatOS API | S=Browser session

 1. U --> SI  Choose provider
 2. SI --> UI  Start provider authentication
 3. UI --> P  Redirect to provider
 4. P --> UI  Callback with provider result
 5. UI --> API  Resolve/link external identity
 6. API --> UI  Account/session result
 7. UI --> S  Establish/update session
 8. UI --> U  Continue in ManatOS
```

Provider-specific protocol/adapters belong to authentication infrastructure. The resulting external identity is presented in Account/User Authentication through reusable summary/related-entry presentation rather than provider-specific User templates.

### Administrative provider credential flow

```text
State transitions:
  [*] --> Stored
  Stored --[Change credentials]--> Editing
  Editing --[Test succeeds]--> Tested
  Editing --[Test fails / continue editing]--> Editing
  Tested --[Save]--> Persisted
  Editing --[Cancel]--> Stored
  Tested --[Cancel]--> Stored
  Stored --[Remove credentials]--> Removed
```

The External Authentication Provider entry intentionally mixes two kinds of values:

- **Client ID** is a canonical entity field and therefore goes through the canonical field dispatcher/field-component pipeline.
- **Client secret** is transient credential workflow state and therefore uses a non-entity workflow input. Plaintext secret material is intentionally never returned after persistence.

Credential testing validates the pending screen state; **Save is the persistence boundary**. See [`../system/System-and-Account-Pages.md`](../system/System-and-Account-Pages.md) and [`Components.md`](../entities/Components.md).

---

## 4. Account-details flow

```text
[A] Account menu
[B] Account details
[G] General
[AU] Authentication
[SD] System details
[DBG] Debugging
[PW] Change password
[EI] External identities

Flow:
  A --> B
  B --> G
  B --> AU
  B --> SD
  B --> DBG
  AU --> PW
  AU --> EI
```

Account details reuse metadata/entity presentation where appropriate but remain an **account/system surface**. Authentication summary content and external-identity presentation should therefore reuse the same canonical/reusable UI behavior as User administration without cloning User-specific renderer logic.

See [`../system/System-and-Account-Pages.md`](../system/System-and-Account-Pages.md) for the surface boundary and [`Components.md`](../entities/Components.md) for reusable non-field summary/collection behavior.

---

## 5. Generic entity administration flow

This is the semantic List/Entry interaction model for Users, Principals, Applications and Licenses. The shared UIS implementation and the established EJS0 implementation have different CTX representations; the example below uses the modern UIS Entry model.

```text
Participants: U=Operator | L=Generic List surface | E=Generic Entry surface | CTX=owning UIS level | API=system-entity API

 1. U --> L  Search/filter/sort/select
 2. L --> E  Open existing or Add new
 3. E --> CTX  Initialize #data.current/#data.original and derived #state
 4. U --> E  Edit canonical fields
 5. E --> CTX  typed field intent -> EntryRuntime.setField()
 6. CTX --> CTX  Evaluate dependent expressions
 7. CTX --> E  calculated/derived state updates through components
 8. U --> E  Create a new record where supported
 9. E --> API  Submit the create transaction
10. API --> E  Return durable GUID and authoritative record
11. E --> CTX  Reconcile #data.original / #data.current
12. E --> U  Caller decides selection or close behavior
```

### Entry state contract

```text
[O] #data.original      canonical baseline record
[W] #data.current       canonical working record
[C] controlled comparison and validation
[D] #state.fields / #state.entry (derived dirty/valid status)
[S] authorized API create + authoritative baseline reconciliation (modern UIS)

O ──┐
    ├──> C ───> D ───> S
W ──┘
```

The working record belongs to the Entry; a reusable field component submits typed input via the Entry mutation boundary. Loading/editing an existing modern UIS Entry does not currently enable its general Save transaction (`saveReady: false`); the API and EJS0 have broader independent update mechanisms. The established EJS0 client has a separate legacy field-node runtime, and its `fields.<key>.value` should not be read as the modern cross-client model.

The form lifecycle is documented in [Entity Entries and Forms](../entities/Entity-Entries-Forms-Detail.md). Reusable field rendering is documented in [Field Components](../entities/Field-Components-Detail.md).

### Changed-field feedback

Direct edits and evaluator-driven changes use the same reversible visual rule:

```text
[B] Captured field baseline
[C] Current canonical value differs?
[H] Decorate field as changed
[R] Normal presentation

Flow:
  B --> C
  C --[yes]--> H
  C --[no]--> R
  H --[value returns to baseline]--> R
```

A calculated field may therefore become visually changed because one of its dependencies changed, without becoming a different kind of field component.

---

### Existing-record selection inside administration

The generic record selector is a reusable branch of administration/list behavior rather than a separate entity page.

```text
Participants: U=Operator | C=Calling component/workspace | RS=Record selector | CTX=selector surface invocation + state | R=Owning runtime

 1. U --> C  Select/Add existing entry…
 2. C --> C  Translate caller semantics into generic SurfaceInvocation rules
 3. C --> RS  Open hosted selector surface
 4. RS --> CTX  Own canonical selector invocation + local working state
 5. RS --> RS  Evaluate source-defined rules against selector-owned CTX
 6. U --> RS  Search/filter/page/select
 7. RS --> C  Return generic selected record(s)
 8. C --> R  Apply caller-side continuation / caller-specific operation
```

Two current examples deliberately share this flow:

- a reference field invokes **Select existing entry…** and applies the returned id through the canonical reference-field runtime;
- the Principal Organization workspace invokes **Add existing entry…** and applies hierarchy-specific parent/child/sibling rules.

The selector reuses ordinary list toolbar/filter/header/paging components. Selection eligibility and result meaning remain caller-owned. Caller-specific semantics are translated before opening into generic invocation/query/behavior rules; the selector enforces those rules against its own canonical CTX. Presentation/container nesting is therefore independent from semantic ownership.

## 6. Principal reference recalculation flow

Principals provide the strongest current example of direct and calculated references sharing one presentation pipeline.

```text
Participants: U=Operator | P=Parent principal reference | CTX=Evaluator / CTX | R=Root principal reference | FC=reference-select field component

 1. U --> P  Select another parent
 2. P --> CTX  Update canonical parentId
 3. CTX --> CTX  Recalculate rootPrincipalId
 4. CTX --> R  Write canonical referenced ID
 5. R --> FC  Refresh reference value
 6. FC --> U  Resolve/display entry icon + entry name
```

The canonical value of the calculated reference may be an ID, but the user-facing representation remains the same canonical reference presentation used for direct values. See [`Field-Components-Detail.md`](../entities/Field-Components-Detail.md).

---

## 7. Related-entry collection editing flow

Contact collections demonstrate child-editor ownership inside a parent entity page.

```text
State transitions:
  [*] --> Collapsed
  Collapsed --[Add / Edit]--> EditingPristine
  EditingPristine --[Change field]--> EditingDirty
  EditingPristine --[Focus leaves editor]--> Collapsed
  EditingDirty --[Focus leaves editor]--> EditingDirty
  EditingDirty --[Add / Update]--> Collapsed
  EditingDirty --[Cancel]--> Collapsed
```

The parent entry cannot save while a child editor is active. Focus leaving a **pristine** child editor may close it automatically; a **dirty** child editor remains open so focus movement never silently commits or discards data.

Structured child fields can themselves use canonical field semantics/options, while the collection component owns draft lifecycle, Add/Update/Cancel and the relationship to the parent record. See [`Components.md`](../entities/Components.md) and [`Composite-Components.md`](../entities/Composite-Components.md).

---

## 8. Principal Organization workspace flow

The Organization tab is an owner-managed hierarchy workspace rather than ordinary scalar form fields.

```text
[P] Principal entry
[O] Organization tab
[W] Hierarchy workspace draft
[A] Add / relate / remove / reorganize
[C] Commit organization
[API] Persist hierarchy changes
[X] Close organization page / clear draft

Flow:
  P --> O
  O --> W
  W --> A
  A --> W
  W --> C
  C --> API
  API --> X
```

The hierarchy workspace owns its transactional graph/draft behavior. Quick-record editors inside it may render canonical entity fields through `entity-field.ejs`, but the workspace — not those field components — owns the draft transaction and final Commit operation.

---

## 9. License validity assisted-calculation flow

License Contents demonstrates editable assisted calculation rather than an alternative field renderer.

```text
[VF] Valid from / date field
[E] Evaluator
[DUR] Validity duration / duration component
[VU] Valid until / date field
[E2] Reverse/assisted calculation

Flow:
  VF --> E
  DUR --> E
  E --> VU
  VU --[declared trigger when applicable]--> E2
  E2 --> DUR
```

Date and duration remain their normal canonical types. The date-duration composite coordinates layout/interaction; calculation metadata controls value causality. See [`Composite-Components.md`](../entities/Composite-Components.md).

---

## 10. Debugging and CTX inspection flow

```text
[PAGE] Current page
[CTX] Live CTX tree
[DBG] Debugging tab
[DEF] Inspect field/formula definition
[VAL] Inspect current calculated value
[API] UI -> API activity
[TRAFFIC] API Traffic viewer

Flow:
  PAGE --> CTX
  PAGE --> DBG
  DBG --> DEF
  DBG --> VAL
  DEF --> CTX
  VAL --> CTX
  API --> TRAFFIC
```

The developer surfaces expose current implementation provenance rather than creating another business/presentation model. Formula-definition inspection and current-value inspection intentionally answer different questions.

See [`../system/System-and-Account-Pages.md`](../system/System-and-Account-Pages.md) and the broader debugger/context architecture documentation outside this UI guide.

---

## 11. Runtime trace for metadata-driven field changes

This cross-cutting trace is useful when debugging any of the administration flows above. It shows which runtime owns each stage without creating a flow-specific renderer.

```text
Participants: U=User | FC=Field component/runtime | MR=sysbo/entry/form-runtime.js | CTX=CTX/evaluator | ES=forms/entry-state.js | FS=forms/entry-field-state.js | SV=forms/entry-save.js

 1. U --> FC  edit/select canonical field
 2. FC --> MR  native canonical value/event
 3. MR --> CTX  replace field value
 4. CTX --> CTX  evaluate dependencies/calculations
 5. CTX --> MR  changed canonical values
 6. MR --> FC  setFieldValue(...)
 7. CTX --> ES  page state may change
 8. CTX --> FS  compare current value with baseline
 9. U --> SV  Save
10. SV --> CTX  reconcile persisted record + baseline
```

This is the generic path for direct and calculated fields. A concrete flow must not add another enum/reference/date/text presentation path simply because its value originated from a different calculation or workflow.

---

## 12. How to document a new flow

A new UI flow should document:

1. **entry point and exit/result**;
2. **pages, tabs, modals/popups and reusable components involved**;
3. **which layer owns transient state, canonical field state and persistence**;
4. **where CTX/evaluator behavior participates**;
5. **security/API authority boundaries**;
6. links to the relevant component/page architecture documents rather than re-explaining those contracts locally.

```text
[ENTRY] Entry point
[UI] Page / popup / component sequence
[STATE] State ownership
[API] Persistence/security authority
[RESULT] Result / continuation

Flow:
  ENTRY --> UI
  UI --> STATE
  STATE --> API
  API --> RESULT
```

The purpose of this guide is to make supported behavior easy to trace **without encouraging flow-specific duplicates of generic UI infrastructure**.

## Executable Flow model

A Flow is an orchestration of steps and optional substeps, not a sequence of UI pages hardwired in a component. The runner owns step status, transitions, cancellation and the `ctx.flow` state tree. The current step is referenced by a pointer. A visible surface lives independently under `ctx.ui.level...` and participates through explicitly bound events and invocation results.

`shared.UI/src/flows/flowRunner.ts` defines step states (`pending`, `running`, `waiting`, `completed`, `failed`, `cancelled`) and registered Flow definitions. Sign-in, registration, password reset and password change illustrate multi-step operations whose credential/API handling remains outside inspectable UI state. See [Flow Execution](Flow-Execution.md) for its definitive lifecycle and security boundaries.
