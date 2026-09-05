# ManatOS UI Flows

## Purpose

This guide documents the **supported end-to-end UI flows** that exercise the page, form, field-component, composite-component and system-surface architecture described elsewhere under `docs/ui/`.

It is intentionally flow-oriented: each section answers **which screens participate, what owns each step, where state lives, and which reusable UI contracts are involved**. Use it together with:

- [`UI-Architecture.md`](UI-Architecture.md) for architectural boundaries and invariants;
- [`UI-Forms.md`](UI-Forms.md) for form lifecycle, dirtiness, validation and Save/Close behavior;
- [`UI-Field-Components.md`](UI-Field-Components.md) for canonical field rendering and field tools;
- [`UI-Components.md`](UI-Components.md) for reusable non-field widgets and collections;
- [`UI-Composite-Components.md`](UI-Composite-Components.md) for multi-field/content composition;
- [`Entity-Pages.md`](Entity-Pages.md) for current metadata-driven entity page models;
- [`System-Pages.md`](System-Pages.md) for authentication, account, configuration and developer/system surfaces.

## Flow map

```mermaid
flowchart TB
    ANON[Anonymous visitor]
    AUTH[Authenticated session]
    ADMIN[Administrative workspace]
    ACCOUNT[Account details]
    BO[SysBO list / entry]
    PROVIDER[External provider administration]
    ORG[Principal organization workspace]
    REL[Related-entry editors]
    DEV[CTX / Debugging / API Traffic]

    ANON -->|Sign in / Sign up / external provider| AUTH
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

```mermaid
sequenceDiagram
    actor U as User
    participant SI as Sign-in page
    participant UI as UI server
    participant API as API auth endpoints
    participant S as Browser session
    participant W as Authenticated workspace

    U->>SI: Enter user name/email + password
    SI->>UI: Submit protected form
    UI->>API: Authenticate credentials
    API-->>UI: Auth result/session material
    UI->>S: Establish browser/API session
    UI-->>U: Redirect to authenticated workspace
    U->>W: Navigate with session context
```

The authentication page is a **system page**, not a metadata-driven entity entry form. Password visibility and password-policy behavior belong to reusable system/form infrastructure, not to SysBO field components. See [`System-Pages.md`](System-Pages.md) and the system-input guidance in [`UI-Components.md`](UI-Components.md).

### Responsibilities

- **Sign-in page**: captures credentials and displays validation/errors.
- **UI authentication route/session layer**: orchestrates browser-session establishment.
- **API**: remains authoritative for authentication/security decisions.
- **Application shell**: changes anonymous actions into authenticated navigation/account actions after session establishment.

---

## 2. Registration and verification flow

```mermaid
flowchart LR
    A[Sign up] --> B[Registration form]
    B --> C[API account creation]
    C --> D[Verification-required state]
    D --> E[Email verification]
    E --> F[Sign in]
    F --> G[Authenticated workspace]
```

Registration uses system-page controls and shared password-policy behavior. The resulting SysUser later appears through the normal metadata-driven Users administration pages; **registration UI and SysUser administration are different presentation/workflow layers over related business data**.

For the metadata-driven User entry model, see [`Entity-Pages.md#users`](Entity-Pages.md#users).

---

## 3. External authentication flow

### User-facing provider sign-in

```mermaid
sequenceDiagram
    actor U as User
    participant SI as Sign-in / Sign-up
    participant UI as UI external-auth route
    participant P as External provider
    participant API as ManatOS API
    participant S as Browser session

    U->>SI: Choose provider
    SI->>UI: Start provider authentication
    UI->>P: Redirect to provider
    P-->>UI: Callback with provider result
    UI->>API: Resolve/link external identity
    API-->>UI: Account/session result
    UI->>S: Establish/update session
    UI-->>U: Continue in ManatOS
```

Provider-specific protocol/adapters belong to authentication infrastructure. The resulting external identity is presented in Account/User Authentication through reusable summary/related-entry presentation rather than provider-specific User templates.

### Administrative provider credential flow

```mermaid
stateDiagram-v2
    [*] --> Stored
    Stored --> Editing: Change credentials
    Editing --> Tested: Test succeeds
    Editing --> Editing: Test fails / continue editing
    Tested --> Persisted: Save
    Editing --> Stored: Cancel
    Tested --> Stored: Cancel
    Stored --> Removed: Remove credentials
```

The External Authentication Provider entry intentionally mixes two kinds of values:

- **Client ID** is a canonical entity field and therefore goes through the canonical field dispatcher/field-component pipeline.
- **Client secret** is transient credential workflow state and therefore uses a non-entity workflow input. Plaintext secret material is intentionally never returned after persistence.

Credential testing validates the pending screen state; **Save is the persistence boundary**. See [`System-Pages.md`](System-Pages.md) and [`UI-Components.md`](UI-Components.md).

---

## 4. Account-details flow

```mermaid
flowchart TB
    A[Account menu] --> B[Account details]
    B --> G[General]
    B --> AU[Authentication]
    B --> SD[System details]
    B --> DBG[Debugging]
    AU --> PW[Change password]
    AU --> EI[External identities]
```

Account details reuse metadata/entity presentation where appropriate but remain an **account/system surface**. Authentication summary content and external-identity presentation should therefore reuse the same canonical/reusable UI behavior as User administration without cloning User-specific renderer logic.

See [`System-Pages.md`](System-Pages.md) for the surface boundary and [`UI-Components.md`](UI-Components.md) for reusable non-field summary/collection behavior.

---

## 5. Generic SysBO administration flow

This is the model flow for Users, Principals, Applications, Licenses and future metadata-driven entities.

```mermaid
sequenceDiagram
    actor U as Operator
    participant L as Generic list page
    participant E as Generic entry page
    participant CTX as Page CTX
    participant API as SysBO API

    U->>L: Search/filter/sort/select
    L->>E: Open existing or Add new
    E->>CTX: Initialize entryOriginal + entry + fields
    U->>E: Edit canonical fields
    E->>CTX: DOM -> canonical field value
    CTX->>CTX: Evaluate dependent expressions
    CTX-->>E: Calculated/current values refresh through field components
    U->>E: Save
    E->>API: Persist current form state
    API-->>E: Persisted record
    E->>CTX: Reconcile current/original baseline
    E-->>U: Stay or close according to Save action
```

### Entry state contract

```mermaid
flowchart LR
    O[entryOriginal\nimmutable baseline] --> C{Compare}
    W[entry\nworking record] --> C
    C -->|different| D[Dirty]
    C -->|same| N[Clean]
    D --> S[Save enabled when valid\nand no child editor active]
```

The form lifecycle is documented in detail in [`UI-Forms.md`](UI-Forms.md). Canonical field rendering is documented in [`UI-Field-Components.md`](UI-Field-Components.md).

### Changed-field feedback

Direct edits and evaluator-driven changes use the same reversible visual rule:

```mermaid
flowchart LR
    B[Captured field baseline] --> C{Current canonical value differs?}
    C -->|yes| H[Decorate field as changed]
    C -->|no| R[Normal presentation]
    H -->|value returns to baseline| R
```

A calculated field may therefore become visually changed because one of its dependencies changed, without becoming a different kind of field component.

---

## 6. Principal reference recalculation flow

Principals provide the strongest current example of direct and calculated references sharing one presentation pipeline.

```mermaid
sequenceDiagram
    actor U as Operator
    participant P as Parent principal reference
    participant CTX as Evaluator / CTX
    participant R as Root principal reference
    participant FC as reference-select field component

    U->>P: Select another parent
    P->>CTX: Update canonical parentId
    CTX->>CTX: Recalculate rootPrincipalId
    CTX->>R: Write canonical referenced ID
    R->>FC: Refresh reference value
    FC-->>U: Resolve/display entry icon + entry name
```

The canonical value of the calculated reference may be an ID, but the user-facing representation remains the same canonical reference presentation used for direct values. See [`UI-Field-Components.md`](UI-Field-Components.md).

---

## 7. Related-entry collection editing flow

Contact collections demonstrate child-editor ownership inside a parent entity page.

```mermaid
stateDiagram-v2
    [*] --> Collapsed
    Collapsed --> EditingPristine: Add / Edit
    EditingPristine --> EditingDirty: Change field
    EditingPristine --> Collapsed: Focus leaves editor
    EditingDirty --> EditingDirty: Focus leaves editor
    EditingDirty --> Collapsed: Add / Update
    EditingDirty --> Collapsed: Cancel
```

The parent entry cannot save while a child editor is active. Focus leaving a **pristine** child editor may close it automatically; a **dirty** child editor remains open so focus movement never silently commits or discards data.

Structured child fields can themselves use canonical field semantics/options, while the collection component owns draft lifecycle, Add/Update/Cancel and the relationship to the parent record. See [`UI-Components.md`](UI-Components.md) and [`UI-Composite-Components.md`](UI-Composite-Components.md).

---

## 8. Principal Organization workspace flow

The Organization tab is an owner-managed hierarchy workspace rather than ordinary scalar form fields.

```mermaid
flowchart TB
    P[Principal entry] --> O[Organization tab]
    O --> W[Hierarchy workspace draft]
    W --> A[Add / relate / remove / reorganize]
    A --> W
    W --> C[Commit organization]
    C --> API[Persist hierarchy changes]
    API --> X[Close organization page / clear draft]
```

The hierarchy workspace owns its transactional graph/draft behavior. Quick-record editors inside it may render canonical entity fields through `entity-field.ejs`, but the workspace — not those field components — owns the draft transaction and final Commit operation.

---

## 9. License validity assisted-calculation flow

License Contents demonstrates editable assisted calculation rather than an alternative field renderer.

```mermaid
flowchart LR
    VF[Valid from\ndate field] --> E[Evaluator]
    DUR[Validity duration\nduration component] --> E
    E --> VU[Valid until\ndate field]
    VU -->|declared trigger when applicable| E2[Reverse/assisted calculation]
    E2 --> DUR
```

Date and duration remain their normal canonical types. The date-duration composite coordinates layout/interaction; calculation metadata controls value causality. See [`UI-Composite-Components.md`](UI-Composite-Components.md).

---

## 10. Debugging and CTX inspection flow

```mermaid
flowchart LR
    PAGE[Current page] --> CTX[Live CTX tree]
    PAGE --> DBG[Debugging tab]
    DBG --> DEF[Inspect field/formula definition]
    DBG --> VAL[Inspect current calculated value]
    DEF --> CTX
    VAL --> CTX
    API[UI -> API activity] --> TRAFFIC[API Traffic viewer]
```

The developer surfaces expose current implementation provenance rather than creating another business/presentation model. Formula-definition inspection and current-value inspection intentionally answer different questions.

See [`System-Pages.md`](System-Pages.md) and the broader debugger/context architecture documentation outside this UI guide.

---

## 11. Runtime trace for metadata-driven field changes

This cross-cutting trace is useful when debugging any of the administration flows above. It shows which runtime owns each stage without creating a flow-specific renderer.

```mermaid
sequenceDiagram
    actor U as User
    participant FC as Field component/runtime
    participant MR as metadata-form-runtime.js
    participant CTX as CTX/evaluator
    participant ES as forms/entry-state.js
    participant FS as forms/entry-field-state.js
    participant SV as forms/entry-save.js

    U->>FC: edit/select canonical field
    FC->>MR: native canonical value/event
    MR->>CTX: replace field value
    CTX->>CTX: evaluate dependencies/calculations
    CTX-->>MR: changed canonical values
    MR->>FC: setFieldValue(...)
    CTX-->>ES: page state may change
    CTX-->>FS: compare current value with baseline
    U->>SV: Save
    SV-->>CTX: reconcile persisted record + baseline
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

```mermaid
flowchart LR
    ENTRY[Entry point] --> UI[Page / popup / component sequence]
    UI --> STATE[State ownership]
    STATE --> API[Persistence/security authority]
    API --> RESULT[Result / continuation]
```

The purpose of this guide is to make supported behavior easy to trace **without encouraging flow-specific duplicates of generic UI infrastructure**.
