# UIS Components and Ownership

A reusable UIS component is a **semantic participant** within a surface. It declares what it contributes to its parent, how it represents state, which actions it accepts and what data it needs. A framework-specific component supplies visual controls and connects interaction to these semantics; it must not become a second domain authority.

## Three contracts, not one

1. **Metadata contract:** canonical field type, constraints, references and calculations; separate UI metadata for layout and presentation.
2. **Runtime contract:** owned `#layout` node, relevant `#state` and `#data`, shared field behavior, explicit action requests and cleanup.
3. **Adapter contract:** render semantic values, route user interaction, manage focus/DOM/modal details, apply the active language and font scale.

A field may have an inline option catalogue or refer to a subsystem-defined enum. These are **two sources feeding one option-field mechanism**, not grounds for separate UI types. Global enum definitions remain under canonical runtime metadata; current selected values belong to the Entry's working data.

## Typed fields

The TypeScript source defines shared behaviors for Boolean, Date, Datetime, Duration, Email, Enum, GUID, Number, Picture, Pictures, Reference, Rich Text, Telephone, Text and Version fields. Embedded Entry components and NG/EJS renderers adapt them to concrete presentation. The host should handle common composition, not reproduce those type-specific semantics in a large conditional renderer.

| Interaction | Semantic concern | Presentation concern |
|---|---|---|
| Edit text/number | Normalize, validate, publish current value | Capture and render input |
| Choose enum | Resolve allowed options; retain canonical selected value | Display localized option labels |
| Choose reference | Resolve authorized related records, identity and representation | Render list-selector popup and return selection |
| Edit picture | Track metadata and pending binary resource semantics | Thumbnail/editor/crop interaction |
| Revert field | Compare baseline/current and restore working value | Update input and dirty marker |

Not every listed source component establishes full behavioral equivalence across clients. Documentation of a specific field must follow its implemented code path and must not imply that an adapter's presentational placeholder is a functional editor.

## Component composition

A component explicitly declares owned child placeholders and registers their semantic layout under its parent. A popup can contain multiple tabs without creating multiple independent popup roots; the active tab is state, while the component-owned layout remains part of its surface. Embedded components should not mutate another component's namespace without an explicit shared contract.

The common ownership rule also applies to toolbars, context menus, action buttons, alerts and diagnostic projections. A host may centralize transient menu coordination or global focus management because these are surface/application responsibilities, while type-specific field tools remain the component's semantic concern.

## Field Tools and menu ownership

The typed Field behavior lists eligible actions; `uiEntryFieldTools()` projects their availability from effective field presentation. The nested `EntryFieldToolsEmbedded` validates semantic requests and returns typed effects to the owning Entry. Angular's `FieldToolsMenu` owns the menu trigger and delegates actions to `EntryContext`. The rendering adapter coordinates dismissal, focus and menu placement without becoming a separate editable record model. A menu action must not write an input directly as an alternative to `Entry.setField()`.

The menu's contents are not a complete authorization policy. Copy/Revert/Inspect CTX and type-specific commands have field-level gating, while protected server operations remain subject to API authorization.

## Integration review

An implementation is complete only when its shared behavior, actual NG/EJS adapters, markup, focus management, accessibility labels, localization and regression checks agree. Avoid treating a matching TypeScript class name across packages as evidence of matching execution semantics.

See [Field Components](../entities/Field-Components-Detail.md), [Entity Entries](../entities/Entity-Entries-Forms-Detail.md), and [UIS Architecture](UIS-Architecture.md).

## A field component's complete boundary

For a complex field, correctness depends on *four distinct layers* working together:

```text
Canonical field metadata
  type / nullable / enum or reference / validation
                  │
Shared typed component behavior
  normalized meaning / actions / derived state
                  │
Embedded layout + Entry ownership
  FormField / typed field / #data.current
                  │
NG/EJS adapter
  focus / input / translated captions / tools
                  │
API validation and persistence
```

**Option fields.** A field may contain direct options or refer to a subsystem-owned enum under canonical `$runtime.enums`. The resolved options are a disposable presentation/validation input, not a second independently authoritative catalogue. The selected value belongs in Entry working data, and read-only policy cannot be bypassed through raw DOM changes.

**Reference fields.** The stored value is a stable related-record identity. Human-readable representation may include canonical label, icon and image when available. List selectors must filter authorized candidates and return identity, not inject untrusted record display text into canonical data.

**Picture fields.** Binary resources and metadata descriptors have different lifecycles. A thumbnail is not a binary commit; crop/zoom/edit operations in a client need a controlled pending-resource model and a storage/API boundary for durable persistence. The UIS framework describes semantic editing without promising full binary persistence for every adapter.

**Dirty and validation state.** The Entry compares original and current semantic values; field errors, required state and save readiness are derived from canonical working state. A CSS dirty badge is a visual projection, not the source of truth.

A component should visibly own its children and its type-specific actions in both shared source and concrete adapter markup. Cross-client parity requires end-to-end tests, not matching filenames. See [UIS Surface Composition](UIS-Surface-Composition.md), [Field Components](../entities/Field-Components-Detail.md) and [Entry Forms](../entities/Entity-Entries-Forms-Detail.md).
