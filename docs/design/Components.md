# Components

## Purpose

UI components are reusable presentation/interaction units that are **not themselves canonical entity fields**. They keep repeated page behavior out of entity-specific templates while remaining distinct from the field-component system.

## Component families in the current UI

```text
ui/views/components/
├── auth/                  reusable authentication presentation
├── debugging/             CTX/API/CLI developer tooling
├── layout/                application-shell presentation
├── navigation/            horizontal/vertical navigation
├── presentation/          generic help/information surfaces
└── sysbo/
    ├── list/              canonical list/browse presentation
    ├── entry/
    │   ├── shell/         entry tabs/actions/orchestration
    │   ├── fields/        canonical metadata-driven field controls
    │   └── content/       composite entry-tab content
    └── hierarchy/         hierarchy workspace interactions

ui/views/popups/
├── auth/
├── illustrations/
├── messages/
├── preferences/
├── selectors/
└── shared/
```

The placement rule is responsibility-first: a record selector belongs under `popups/selectors/` because it owns a popup workflow, even though it composes canonical SysBO list components. Likewise, canonical field controls belong under `sysbo/entry/fields/`, while higher-level tab content belongs under `sysbo/entry/content/`.

## Responsibilities

A reusable non-field component may own:

- presentation and interaction for a non-field concept;
- rendering a related collection or hierarchy;
- a reusable panel, toolbar, navigation or status/workflow surface;
- component-local browser interaction and transient UI state;
- metadata-declared options/bindings;
- delegation to canonical field components when it embeds actual entity fields.

It must not own:

- a second definition of canonical field type/value semantics;
- business calculation evaluation;
- entity-specific display hacks that belong in metadata or generic representation infrastructure;
- persistence decisions that belong to the page/domain/API layer.

## Metadata component dispatch

```text
[M] UI metadata / component key/options/bindings
[T] entry-tab-content.ejs
[R] metadata component registry
[P] registered reusable partial/runtime
[DOM] DOM

Flow:
  M --> T
  T --> R
  R --> P
  P --> DOM
```

The registry is intentional. Generic renderers use stable semantic component keys; they do not derive filenames from entity names or arbitrary metadata strings.

## Related collections

`related-collections.ejs` is the model for multi-entry relationship presentation. It renders domain rows using canonical entry representation metadata. Entry icon/name rules are centralized rather than rebuilt by every owner entity.

```text
owner entry
└── related collection component
    ├── related entity metadata / entry representation
    ├── relationship data rows
    └── canonical row presentation + navigation
```

Current examples include User/Account external identities and Principal/Application license relationships. The owner page may differ, but the representation rule must not.

## Existing-record selector

`views/popups/selectors/record-selector.ejs` plus `public/js/popups/record-selector.js` implement the generic **Select existing entry** surface.

The selector is not an entity-specific page and not a field component. It is a reusable hosted surface that consumes canonical entity/list metadata and candidate records, then adds selection semantics under a canonical `SurfaceInvocation`. The same invocation model applies to first-level pages, nested pages and popups: presentation/container hierarchy does not define semantic ownership.

```text
[LM] Canonical entity + list metadata
[CAND] Candidate records
[INV] SurfaceInvocation
[RS] Record selector
[LIST] Shared list toolbar / filters / header / paging
[CTX] selector surface CTX state
[RESULT] Canonical selected record(s)

Flow:
  LM --> RS
  CAND --> RS
  INV --> RS
  RS --> LIST
  RS --> CTX
  RS --> RESULT
```

The selector deliberately composes the same `list-toolbar`, `list-filters`, `list-table-header` and `list-paging` partials used by ordinary SysBO list pages. That shared structure is an architectural contract: changes to common list presentation must be reviewed for both browse and selection contexts.

### Surface invocation vs selector state

The selector owns its own canonical CTX level. Its invocation describes why/how the surface was opened; mutable selector state remains local to that surface.

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
        ├── list
        │   ├── originalEntries
        │   └── entries
        ├── selector-local working state
        ├── filters / search / paging
        ├── selectedId / selectedIds
        └── state
```

`SurfaceInvocation` is host-neutral and contains only facts/rules the child surface needs to enforce its own behavior. It does **not** contain `targetField`, parent mutation instructions or arbitrary caller state. Those belong to the caller-side continuation registry.

Expression-bearing rules remain authored as canonical expression source. ASTs are resolved lazily through the process-local expression cache/runtime boundary and are never stored in `SurfaceInvocation` or semantic CTX.

Presentation policy still supports generic orientations such as subdued list-like treatment versus entry-oriented treatment, but those are represented as declarative presentation/behavior rules rather than caller-specific selector parameters. Captions and other presentation may be derived from canonical invocation facts or explicit generic presentation values; the selector does not dereference caller internals to construct them.

Current consumers include:

- Principal Organization workspace — **Add existing entry…** with hierarchy eligibility translated into generic query rules;
- canonical reference fields — **Select existing entry…** with field-domain restrictions translated into generic selector rules.

The selector returns canonical selected record(s). The caller remains responsible for the meaning of that result: a reference field updates its canonical reference value through the field-component runtime; the Organization workspace creates/repositions a hierarchy relation through its own relationship rules. The generic selector must not contain Principal-specific hierarchy policy, field-component DOM logic or direct persistence behavior.

## Hierarchy/workspace components

Hierarchy components under `views/components/sysbo/hierarchy/` (`hierarchy-workspace`, `record-quick`) present organization/tree interactions over domain relationships. They consume metadata and records but do not redefine Principal field/reference semantics. Relationship eligibility remains in the hierarchy caller even when the generic record selector presents the candidates.

## Debugging components

CTX Viewer, API Traffic, debugging panels and CLI components are system/developer UI. They own debugging interaction and visualization, not entity-field semantics. Their state/lifecycle rules are documented with the system UI rather than embedded into business entity definitions.

## Choosing UI component vs field component

```text
[Q] Does this represent exactly one canonical field?
[F] Field component
[R] Does it compose several canonical fields?
[C] Composite component
[U] Reusable UI component

Flow:
  Q --[yes]--> F
  Q --[no]--> R
  R --[yes]--> C
  R --[no]--> U
```

## Workflow-input components

Non-entity UI sometimes needs ordinary input controls: transient secrets, search/filter terms, confirmation values, test parameters, CLI text and similar workflow-local state. These are **UI inputs, not entity field-components**.

`views/components/sysbo/entry/content/workflow-input.ejs` is the small reusable server-rendered input primitive for such transient/system workflows where an ordinary Bootstrap input is appropriate. It intentionally does not:

- read canonical `fieldDefinition` metadata;
- bind `data-ctx-field` into the owning `ctx.ui...level.fields` branch;
- expose the canonical field-tools menu;
- claim persistence, calculation or validation semantics belonging to entity fields.

```text
[UI] UI component
[W] workflow-input
[L] component-local/workflow state
[A] component runtime/action
[P] save/test/command boundary

Flow:
  UI --> W
  W --> L
  L --> A
  A --[only through owning workflow]--> P
```

The External Authentication Provider credential editor is the model example: `clientId` is a canonical entity field and therefore goes through `entity-field.ejs`; plaintext `clientSecret` is transient workflow state and therefore uses the non-entity workflow input.

## Inline collection-editor focus semantics

The reusable collection editor owns a local child draft until Add/Update or Cancel. Focus movement is not a persistence command. To keep the form compact without risking data loss, a pristine open editor closes when interaction focus genuinely leaves that collection, while a dirty editor remains open. Focus transitions inside the collection (including dropdown menus) do not close it.

```text
[O] Inline editor open
[F] Focus leaves collection?
[K] Keep editor
[D] Draft dirty?
[C] Close pristine editor
[X] Only Add/Update or Cancel resolves dirty draft

Flow:
  O --> F
  F --[No]--> K
  F --[Yes]--> D
  D --[No]--> C
  D --[Yes]--> K
  K --> X
```

This behavior is generic to the collection component; Contact entity metadata does not implement its own blur/focus rules.
