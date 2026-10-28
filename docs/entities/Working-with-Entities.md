# Working with Entity Lists and Entries

Generic Lists and Entries are the principal interactive realizations of canonical entity metadata. They expose collection queries, editable records, typed fields, relationships and semantic actions through the shared UIS runtime. The API remains authoritative for data, authorization and persistence. Different presentation adapters render the same semantic contracts without redefining the business model.

The source reference for modern behavior is `shared.UI/src/components/list/`, `shared.UI/src/components/entry/`, `shared.UI/src/components/fields/` and `shared.UI/src/runtime/surface/`. The established `ui.EJS0` client contains a separate mature implementation whose own CTX and presentation rules should be understood within that client, not substituted for the modern UIS runtime.

## 1. End-to-end architecture

```text
Canonical entity and UI metadata
           │
           ▼
  authorized API resource port
           │
           ▼
      UIS Surface Host
   ctx.ui.level[.level...]
   #control #state #layout #data
           │
      ┌────┴─────┐
      │          │
 List content  Entry content
      │          │
 filter/query   typed field components
 selection      editable #data.current
      │          │
      └────┬─────┘
           ▼
   Angular/EJS presentation
           │
       API commands
           │
   authorization + validation
           │
    persistence and results
```

A generic entity client consumes the stable **entity key** and metadata-defined fields, views, relationships and policies. It does not need one bespoke List or Entry controller per entity. Specific entities can still supply their own business invariants through canonical metadata and authoritative server operations.

## 2. Surface identity and ownership

`UiSurfaceHostRuntime` publishes exactly one level beneath the active parent and creates four namespaces together:

| Level namespace | Purpose |
|---|---|
| `#control` | host mode (`page` or `popup`), kind, identity and invocation/resource contract |
| `#state` | selection, editing mode, interaction status, errors, validation and action readiness |
| `#layout` | component-owned semantic layout and composition |
| `#data` | authoritative working data, query facts and supporting resource projections |

A List can open an Entry or a reference-selector List. A nested popup occupies a child `level` and may return a typed result to the invoker. Parent data remains parent-owned throughout the nested interaction. Surface publication is atomic, subscriptions are owned and disposal checks surface identity and active children. See [UI Surfaces and Levels](../clients/UI-Surfaces-and-Levels.md).

## 3. List content

`UiListContentRuntime` and `ListPageRuntime` define query, paging, selection and semantic List state. Embedded List components independently contribute header, actions, search, views, filters, columns, rows/cells and pagination. A rendering adapter should expose the same actions without duplicating query semantics.

```text
#control                    host/list identity, invocation
#data.list                  visible record projections
#data.filters               search and structured filter input
#data.listModel             query, paging, selected IDs and descriptor
#data.references            authorized referenced-entry data
#data.imageVariants         image presentation resources
#state.list                 view, sort, direction, page, loading, errors
#layout                     embedded List/row/cell components
```

List state distinguishes **selection mode** (`none`, `single`, `multiple`) from record-editing authority. Search, sort and paging are query semantics, not merely DOM convenience. The request/query runtime owns result versions, loading, stale-result suppression and cancellation. Per-row names/icons/thumbnails should come from canonical entry representation, not ad hoc field labels.

The API applies row authorization before consumer-visible filtering, sorting and paging. A browser query result is not a security boundary; a direct record read must be independently authorized as well.

### A List as a selector

A reference selector reuses List semantics while supplying a selection result instead of ordinary navigation. Its parent retains ownership of the reference field. On successful selection, the parent invokes its own Entry field-update contract using the chosen stable record ID. Cancel or failure does not modify the parent record.

## 4. Entry content and its canonical record

`UiEntryContentRuntime` and `UiEntryRuntime` own Entry semantics; the embedded registry composes the Entry, tabs, field host and typed field components. The modern Entry level has the following core shape:

```text
#control
  host, kind='entry', entityName, instanceId, invocation
#data
  original           server baseline or null for create
  current            canonical working record
  references         authorized reference catalogues
  imageVariants      visual resources
#state
  fields             per-field validation, readonly and dirty projection
  entry              mode, activeTab, loading, saving, dirty, valid,
                     blocked, saveReady, errors and permissions
#layout
  Entry > Tabs > FormField > typed Field
```

**`#data.current` is the single editable record authority.** Its comparison baseline is `#data.original`. A field component decodes typed input, requests `setField(field, value)`, and observes the Entry's resulting projection. It does not install a separate writable `fields.<key>.value` authority in this UIS model. The EJS0 browser runtime uses a different, legacy field-node model; descriptions of that model must be explicitly scoped to EJS0.

New-entry initialization applies canonical field defaults and applicable invocation-projected values. Existing-record loading uses the authorized resource port. The Entry checks request/edit generations to avoid applying late results to a newer surface state. The selected UI View determines visible tabs, presentation and actions without redefining canonical business fields.

### Field types and option sources

The reusable field behavior registry supports text, number, boolean, date/time, duration, version, GUID, email, telephone, enums, references, rich text and picture types. Enum fields can resolve effective options from referenced subsystem enums or field-inline option metadata through one semantic mechanism. Display labels are localized projections; stored enum identity remains canonical. Reference fields store record identity rather than the rendered related-entry name.

A field's read-only status can originate in canonical metadata, Entry mode, API-derived capabilities or effective UI metadata. A visual read-only control does not authorize an API operation. Source and design references: [Fields](Fields.md), [Field Components](Field-Components-Detail.md) and [Metadata Model](../metadata/Metadata-Model.md).

## 5. Changes, calculations and validation

```text
Browser/native input
        │
Typed Field decoding and semantic intent
        │
EntryRuntime.setField(field, value)
        │
#data.current updated by Entry owner
        ├──► #state.fields / #state.entry derive status
        ├──► reactive expressions reevaluate dependencies
        └──► rendering adapters present new projections
```

Calculated/defaulted and normalized values follow canonical metadata semantics. The evaluator is pure with respect to persistence: evaluating an expression cannot independently commit, grant API access or mutate an unrelated field. API-side validation and normalization remain authoritative for writes from every client, including non-UI clients.

Entry dirty state compares the editable record with its baseline. Composite child editors can have separately owned draft/aggregate contributions. The save decision must consider relevant validation, readonly/permission state, active children and compound changes rather than only whether one input emitted a DOM event.

## 6. Popups, invocation and relationships

A popup adds presentation hosting, focus and close behavior to semantic content. A List in selection mode remains a List; an Entry opened to inspect or create a related record remains an Entry. The invocation identifies entity, host, view or mode, resource context and the calling surface's continuation contract.

```text
Entry level (#data.current.referenceField)
   └── ReferenceField requests selector
        └── List popup level (own #state and #data)
             ├── Select stable related-record ID
             └── Return result to parent
                  └── Entry.setField('referenceField', id)
```

Related-record creation may open an Entry popup with fixed/default values required by relationship metadata. Successful persistence returns the created ID and representation to the parent; failure or cancellation leaves the parent value unchanged. The API validates relationship integrity, authorization and any transaction constraints.

This arrangement separates the **host shell** from reusable List/Entry semantics and prevents each selector or relationship from inventing its own entity display or editing engine. See [Popups and Selectors](Popups-and-Selectors.md) and [Relationships](Relationships.md).

## 7. Commit and recovery

An Entry's working values are not committed simply because CTX is dirty or a popup closes. A save/commit operation crosses the API boundary, where authorization, normalization, relationships, calculations and storage transactions apply. The returned persisted record can then reconcile both `#data.current` and `#data.original`.

For compound workspaces, pending child rows and `draft:*` identities can participate in an aggregate transaction. A draft ID is not an existing persisted record. Browser-local recovery is similarly separate from server persistence and must never silently acquire commit authority. Picture/binary resources require their own resource-transport and atomicity contracts; the existence of an editor does not prove that every adapter supports complete binary persistence. See [Workspace Commit and Recovery](Workspace-Commit-and-Recovery.md).

## 8. Responsibilities and testing

A generic List/Entry feature should be verified across more than one entity and more than one presentation adapter. Important cases include record and collection authorization, stale requests, view changes, enum/inline options, reference selection, nested popup closure, default/calculated fields, compound dirtiness, save response reconciliation and cancellation without mutation.

The shared semantic runtime owns meaning and lifetime; the concrete Angular/EJS adapter owns focus, DOM/event bridging, presentation and window mechanics; the API owns security and persistent business truth. These boundaries make the same metadata meaningful in multiple client technologies without treating visual parity as a substitute for semantic correctness.

See [Entity Lists](Entity-Lists.md), [Entity Entries](Entity-Entries.md), [UIS Architecture](../clients/UIS-Architecture.md), [CTX Architecture](../context/Context-Architecture.md) and [API Architecture](../api/API-Architecture.md).
