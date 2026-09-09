# UI Flows

## Purpose

This guide documents the **supported end-to-end UI flows** that exercise the page, form, field-component, composite-component and system-surface architecture described elsewhere under `docs/ui/`.

It is intentionally flow-oriented: each section answers **which screens participate, what owns each step, where state lives, and which reusable UI contracts are involved**. Use it together with:

- [`../architecture/UI-Architecture.md`](../architecture/UI-Architecture.md) for architectural boundaries and invariants;
- [`Entity-Entries-Forms-Detail.md`](Entity-Entries-Forms-Detail.md) for form lifecycle, dirtiness, validation and Save/Close behavior;
- [`Field-Components-Detail.md`](Field-Components-Detail.md) for canonical field rendering and field tools;
- [`Components.md`](Components.md) for reusable non-field widgets and collections;
- [`Composite-Components.md`](Composite-Components.md) for multi-field/content composition;
- [`Entity-Entries.md`](Entity-Entries.md) for current metadata-driven entity page models;
- [`../usage/System-and-Account-Pages.md`](../usage/System-and-Account-Pages.md) for authentication, account, configuration and developer/system surfaces.

## Flow map

```text
[ANON] Anonymous visitor
[AUTH] Authenticated session
[ADMIN] Administrative workspace
[ACCOUNT] Account details
[BO] SysBO list / entry
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
Participants: U=User | SI=Sign-in page | UI=UI server | API=API auth endpoints | S=Browser session | W=Authenticated workspace

 1. U --> SI  Enter user name/email + password
 2. SI --> UI  Submit protected form
 3. UI --> API  Authenticate credentials
 4. API --> UI  Auth result/session material
 5. UI --> S  Establish browser/API session
 6. UI --> U  Redirect to authenticated workspace
 7. U --> W  Navigate with session context
```

The authentication page is a **system page**, not a metadata-driven entity entry form. Password visibility and password-policy behavior belong to reusable system/form infrastructure, not to SysBO field components. See [`../usage/System-and-Account-Pages.md`](../usage/System-and-Account-Pages.md) and the system-input guidance in [`Components.md`](Components.md).

### Responsibilities

- **Sign-in page**: captures credentials and displays validation/errors.
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

Registration uses system-page controls and shared password-policy behavior. The resulting SysUser later appears through the normal metadata-driven Users administration pages; **registration UI and SysUser administration are different presentation/workflow layers over related business data**.

For the metadata-driven User entry model, see [`../apps-design/protocrm/Users-and-Principals.md`](../apps-design/protocrm/Users-and-Principals.md).

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

Credential testing validates the pending screen state; **Save is the persistence boundary**. See [`../usage/System-and-Account-Pages.md`](../usage/System-and-Account-Pages.md) and [`Components.md`](Components.md).

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

See [`../usage/System-and-Account-Pages.md`](../usage/System-and-Account-Pages.md) for the surface boundary and [`Components.md`](Components.md) for reusable non-field summary/collection behavior.

---

## 5. Generic SysBO administration flow

This is the model flow for Users, Principals, Applications, Licenses and future metadata-driven entities.

```text
Participants: U=Operator | L=Generic list page | E=Generic entry page | CTX=Page CTX | API=SysBO API

 1. U --> L  Search/filter/sort/select
 2. L --> E  Open existing or Add new
 3. E --> CTX  Initialize field values/baselines + entry mirrors
 4. U --> E  Edit canonical fields
 5. E --> CTX  DOM -> canonical field value
 6. CTX --> CTX  Evaluate dependent expressions
 7. CTX --> E  Calculated/current values refresh through field components
 8. U --> E  Save
 9. E --> API  Persist current form state
10. API --> E  Persisted record
11. E --> CTX  Reconcile current/original baseline
12. E --> U  Stay or close according to Save action
```

### Entry state contract

```text
[O] fields.<key>.originalValue / canonical baseline
[C] Compare
[W] fields.<key>.value / canonical live value
[D] Dirty
[N] Clean
[S] Save enabled when valid / and no child editor active

Flow:
  O --> C
  W --> C
  C --[different]--> D
  C --[same]--> N
  D --> S
```

The form lifecycle is documented in detail in [`Entity-Entries-Forms-Detail.md`](Entity-Entries-Forms-Detail.md). Canonical field rendering is documented in [`Field-Components-Detail.md`](Field-Components-Detail.md).

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
Participants: U=Operator | C=Calling component/workspace | RS=Record selector | CTX=popup.callingParams + state | R=Owning runtime

 1. U --> C  Select/Add existing entry…
 2. C --> RS  Open with entity + purpose + candidates + rules
 3. RS --> CTX  Publish resolved callingParams
 4. RS --> RS  Evaluate precompiled UI policy against callingParams
 5. U --> RS  Search/filter/page/select
 6. RS --> C  Return canonical selected record(s)
 7. C --> R  Apply caller-specific operation
```

Two current examples deliberately share this flow:

- a reference field invokes **Select existing entry…** and applies the returned id through the canonical reference-field runtime;
- the Principal Organization workspace invokes **Add existing entry…** and applies hierarchy-specific parent/child/sibling rules.

The selector reuses ordinary list toolbar/filter/header/paging components. Selection eligibility and result meaning remain caller-owned. Presentation policy is evaluator-driven from the same `callingParams` visible in CTX: Organization currently requests the subdued workspace treatment, while reference-field invocation requests the entry-oriented treatment.

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

The canonical value of the calculated reference may be an ID, but the user-facing representation remains the same canonical reference presentation used for direct values. See [`Field-Components-Detail.md`](Field-Components-Detail.md).

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

Structured child fields can themselves use canonical field semantics/options, while the collection component owns draft lifecycle, Add/Update/Cancel and the relationship to the parent record. See [`Components.md`](Components.md) and [`Composite-Components.md`](Composite-Components.md).

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

Date and duration remain their normal canonical types. The date-duration composite coordinates layout/interaction; calculation metadata controls value causality. See [`Composite-Components.md`](Composite-Components.md).

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

See [`../usage/System-and-Account-Pages.md`](../usage/System-and-Account-Pages.md) and the broader debugger/context architecture documentation outside this UI guide.

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
