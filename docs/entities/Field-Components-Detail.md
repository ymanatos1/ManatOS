# Field Components

Field components are the client-side implementations that present and edit canonical entity fields. They are selected from the field's canonical type plus effective UI metadata; they do not own a parallel business value model.

## Runtime contract

For an entry field, the canonical flow is:

```text
entity metadata + UI overrides
          |
          v
effective field definition
          |
          v
field component  <---- projection ----  CTX field owner
      |                                  |
      +---- candidate mutation --------->+
```

The entry/field runtime owns the canonical current value, baseline, validation and derived readonly/visibility state. A component may own **private interaction state** (open dropdown, cropper coordinates, editor selection, temporary DOM details), but semantic changes must be projected to the canonical field owner.

This is why two different clients can implement the same field type without changing entity semantics.

## Current field presentations

| Canonical type | Main behavior |
| --- | --- |
| `guid`, `string` | text-like display/editing with canonical length/readonly/required rules |
| `email` | text/email editing; normalization belongs to metadata/expression/API semantics |
| `telephone` | telephone editing/display; compound contact editors may compose multiple canonical fields |
| `boolean` | boolean interaction and display |
| `number` | numeric candidate editing |
| `date`, `datetime` | date/date-time interaction and canonical string/value projection |
| `duration` | structured years/months/days editing through the dedicated duration partial |
| `version` | version-oriented input with canonical version rules |
| `enum` | option selector driven by enum metadata, labels/icons/tones/traits and effective allowed values |
| `reference` | generic record selection against a target entity and declarative candidate restrictions |
| `picture` | one-picture display/editor, including pending unsaved picture state |
| `pictures` | multi-picture value presentation/editing |
| `richText` | rich text editing using the client rich-text runtime while projecting the canonical content value |

The established EJS0 implementation includes dedicated partials such as `duration-field.ejs`, `enum-select.ejs`, `reference-select.ejs`, `picture-field.ejs`, `picture-editor.ejs`, `pictures-field.ejs` and `rich-text-field.ejs`. These filenames are implementation detail; the architectural contract is the canonical field behavior above.

## Effective metadata

A component receives already-resolved semantics. The generic runtime combines canonical entity metadata with appropriate UI overrides/invocation restrictions before rendering. Components should not independently reimplement:

- entity-specific visibility;
- authorization policy;
- enum business rules;
- reference candidate rules;
- expression parsing;
- relationship policy.

For example, the reference component consumes `referenceSelection`; it does not know that a particular field happens to be `parentId`.

## Mutation and event behavior

A normal user edit follows the shared field-state runtime:

```text
user interaction
  -> value:changing
  -> canonical CTX field value mutation
  -> dependency/reactive work
  -> validation/state recomputation
  -> value:changed / field-state:changed
  -> any affected component projection
```

The event stream reports semantic transitions; it is not itself authoritative state. See [State, Mutation and Events](../context/State-Mutation-and-Events.md).

## Field Tools: semantic actions and presentation

Field Tools are defined from each registered Field behavior, not from a generic menu hard-coded with every possible operation. `shared.UI/src/components/entry/EntryMetadata.ts` implements `uiEntryFieldTools()`, combining the field's declared tool capabilities with its effective read-only, required and dirty state. The separate `EntryFieldToolsEmbedded` handles validated tool intents; actions that change data return an Entry effect rather than editing native input nodes directly.

```text
field metadata + typed behavior + Entry field state
                       │
                       ▼
                 uiEntryFieldTools()
                       │
                 enabled actions
                       │
          concrete NG/EJS Field Tools menu
                       │
                action / selected field
                       ▼
               embedded action handler
                       │
                 Entry field mutation
```

Common actions include **Copy**, **Revert** and developer-only **Inspect CTX**. Type-specific actions include **Trim**, **Clear**, **Zero**, **Today**, **Now** and **Select reference**, subject to the registered behavior and field policy. Required references do not expose Clear Selection. Revert is offered only for a dirty editable field. Reference selection delegates to a List surface and returns a canonical identity; it is not a textual input shortcut. Disabled or absent menu actions cannot bypass authoritative API enforcement.

Angular's `FieldToolsMenu.ts` owns its trigger, available actions and dispatch to `EntryContext`; corresponding EJS presentation implements the same semantic intent through its adapter. Menu layering, focus and clipping protection are presentation-host responsibilities, not field-value contracts.

## Calculated fields

Field components are type-driven, not calculation-driven. If a `string`, `date`, `reference` or other typed field is calculated, the calculation runtime updates its canonical field value and the existing type component receives the result.

Persisted calculations are also materialized by the API before commit. A component must not be the only place where a persisted formula is executed.

## Enum component

The enum component supports canonical `enumItems`/`enumValues`, including:

- stored value versus label;
- optional semantic icon;
- optional tone/tone strength;
- declarative traits;
- effective UI restrictions such as allowed values.

Metadata remains authoritative; the renderer chooses concrete visual treatment.

## Reference component

The reference selector can:

- retrieve candidate records from the referenced entity;
- show canonical entry representation for candidates;
- honor server authorization and empty a forbidden reference catalogue where appropriate;
- apply declarative `referenceSelection` rules;
- exclude the current record for self-references;
- enforce one-to-one availability through `uniqueThrough`;
- open related-record creation with metadata-projected defaults/fixed values/overrides;
- return the selected record identity to the owning field.

See [Popups and Selectors](Popups-and-Selectors.md) and [Relationships](Relationships.md).

## Picture component

Picture interaction may require private runtime state for file selection, crop/edit operations and previews. The important ownership rule is that once the user selects/edits a pending picture, the **canonical current entry field value reflects that pending semantic value** even before the entry is saved. A stale `null` CTX value with the real picture hidden only inside the cropper would violate the single-owner model.

Save reconciles the persisted result and baseline through the normal entry lifecycle.

## Rich-text component

The rich-text editor has rich private editor state, but the canonical document/content value is projected through the same entry field contract. Draft restoration, dirty state and persistence should therefore reason about the canonical field value rather than a detached editor-only copy.

## Duration component

A duration has **one canonical ISO-style string** value (for example `P1Y2M3D`), although its editor presents separate year, month and day controls. `DurationFieldBehavior` accepts the ISO form and `uiDurationFromParts()` combines control parts into one value; malformed/negative portions do not produce a mutation. `durationUnits` controls which parts are exposed. The expression calendar helpers accept/return a separate structured `{ years, months, days }` representation, so clients integrating those helpers must handle conversion explicitly rather than assuming the two representations are interchangeable.

The `date-duration-range` composite component can coordinate a date + duration + calculated/related end date, but it does not change ownership of the three canonical fields.

## Display/read-only behavior

Read-only fields still use type-aware representation. A read-only reference should display the referenced entry representation; an enum should retain its label/icon/tone; a picture should remain visual; rich text should render rich content appropriately.

This prevents "read-only" from degrading into untyped raw JSON/string output.

## Validation

Components can provide immediate interaction feedback, but canonical rules come from metadata/runtime and authoritative API validation. A component should not invent a rule that exists only in its DOM implementation.

See [Validation](Validation.md).

## Adding or changing a field component

When extending a component, verify at least:

- canonical value shape and null semantics;
- create/edit/view/read-only modes;
- baseline/dirty projection;
- programmatic CTX updates as well as direct DOM input;
- validation/error presentation;
- expression-driven readonly/visibility changes;
- hosted page and popup use;
- list/summary/reference display when relevant;
- accessibility and keyboard behavior where applicable;
- regression coverage.

For reusable non-field UI capabilities, use the metadata component infrastructure described in [Components](Components.md) instead of overloading a field type.

## UIS type behavior and embedded component ownership

The shared field catalog now has two explicit implementation layers: `shared.UI/src/components/fields/types/*Behavior.ts` for type semantics and `shared.UI/src/components/entry/embedded/types/*.ts` for concrete embedded component contributions. A generic `FormField` composes known field contracts; it should not become a second implementation of every type's semantics. Angular and EJS presentation components render the contract and translate direct user events into typed intent.

This separation is essential to the distinction between recognizing a type and supporting its complete editor. The existence of `PictureFieldBehavior` or `ReferenceFieldBehavior` confirms a type behavior module, but each corresponding adapter's create/edit/display path must be checked for actual capability. An image collection additionally involves thumbnail selection, staged resources and persistence status; treating it as a string input loses domain meaning.

Current value and derived option labels must also be kept distinct. A `Enum` field may resolve options from a subsystem enum or inline field metadata; the shared behavior determines the available options while the stored selected value remains in the Entry working data. Localization changes option labels without changing selected identities.
