# Fields

A field is a canonical property of an entity. Its **type** describes the business value, not the HTML control used by the current web client. UI implementations select an appropriate field component from that canonical type and effective UI metadata.

The currently supported canonical `SysBOFieldType` values are defined in `shared/src/metadata/bo/types.ts`.

## Supported field types

| Type        | Canonical value / purpose                                                                         | Current generic presentation                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `guid`      | Stable identifier string, commonly generated/read-only.                                           | Text-like read-only/display field unless an explicit interaction needs otherwise.                        |
| `string`    | General text with optional min/max length.                                                        | Text input or text display.                                                                              |
| `email`     | Email string; can use canonical `EmailAddress(value)` normalization.                              | Email-oriented input/display semantics.                                                                  |
| `telephone` | International telephone string; canonical normalization is available through `TelephoneNbr(...)`. | Telephone-oriented input/display; compound contact editors may capture country code + number separately. |
| `boolean`   | `true`/`false`.                                                                                   | Checkbox/toggle-style editing and boolean display.                                                       |
| `number`    | Numeric scalar.                                                                                   | Number input/display.                                                                                    |
| `date`      | Calendar date, normally `YYYY-MM-DD`.                                                             | Date field.                                                                                              |
| `datetime`  | Date/time value used by audit and application fields.                                             | Date/time-oriented display/editing according to effective metadata.                                      |
| `duration`  | Structured calendar duration `{ years, months, days }`.                                           | Dedicated duration field; `durationUnits` can restrict exposed units.                                    |
| `version`   | Version string; canonical `versionFormat: 'semver'` currently means numeric `major.minor.patch`.  | Version-aware text editing/validation.                                                                   |
| `enum`      | One value from canonical enum metadata.                                                           | Enum selector using `enumItems`/`enumValues`, labels, icons, tones and traits.                           |
| `reference` | Identifier of a record in another entity (`referenceBOKey`).                                      | Reference selector with metadata-defined candidate filtering and related-entry behavior.                 |
| `picture`   | One structured picture value.                                                                     | Picture display/editor with pending-value handling.                                                      |
| `pictures`  | Multiple structured picture values.                                                               | Multi-picture presentation/editor semantics.                                                             |
| `richText`  | Structured rich-text/HTML-oriented content managed by the rich-text component.                    | Rich-text editor/display component.                                                                      |

The type vocabulary is deliberately UI-neutral. A future Angular/mobile client can render the same canonical types differently while preserving their value semantics.

## Field metadata

Common canonical properties include:

- identity/presentation: `key`, `label`, `type`, `order`;
- constraints: `required`, `nullable`, `minLength`, `maxLength`, `unique`;
- ownership: `generated`, `readOnly`, `applicationManaged`, `sensitive`;
- creation: `createDefaultValue` as a literal or `{ expression }`;
- discrete values: `enumValues`, richer `enumItems`, and non-constraining `optionItems`;
- references: `referenceBOKey` and `referenceSelection`;
- specialized semantics: `durationUnits`, `versionFormat`;
- normalization: `normalize.expression`;
- calculation: `calculation.expression` and optional `calculation.persisted`.

See [Metadata Model](../metadata/Metadata-Model.md) for the canonical schema itself.

## Type is separate from value source

A calculated field does **not** become a special "calculated field type". Calculation answers **where the value comes from**; `type` continues to answer **what the value is**.

For example:

```ts
fullNumber: {
  key: 'fullNumber',
  label: 'Full number',
  type: 'telephone',
  calculation: {
    expression: 'TelephoneNbr(countryCode, number)',
    persisted: true
  }
}
```

The value is still a telephone value, so clients use the telephone field semantics. The calculation runtime determines its source and the API materializes it before persistence.

The same distinction applies to literal/defaulted, user-edited, application-managed and calculated values.

## Defaults

`createDefaultValue` belongs to canonical entity metadata because a default is a business-object creation semantic, not merely a UI convenience. It can be literal or expression-backed:

```ts
validFrom: {
  type: 'date',
  createDefaultValue: { expression: 'CurrentDay()' }
}
```

The API also applies canonical defaults for non-UI creation paths. A client may show the resolved default immediately, but must not invent a conflicting client-only default.

## Normalization

`normalize.expression` transforms candidate input into its canonical representation at the appropriate boundary. The expression receives the current candidate as `value`.

Examples used by current metadata include:

```text
EmailAddress(value)
TelephoneNbr(value)
```

Normalization is not field-component code. This keeps the same semantic rule available to multiple clients and API/domain writes.

## Enum fields

An enum may expose rich `enumItems` containing a stored `value`, optional `label`, icon, semantic tone and additional declarative traits. Traits can drive generic rules without hard-coding concrete enum values into clients.

UI metadata may further restrict allowed values for a particular surface, but it does not redefine the canonical enum domain.

## Reference fields

A `reference` field names its target through `referenceBOKey`. `referenceSelection` can declaratively constrain candidate selection:

- `filterExpression`;
- `filterEnumItemTrait`;
- `excludeCurrent`;
- `uniqueThrough`;
- `createRelated` defaults/fixed values/UI overrides.

The generic reference selector consumes those declarations. It should not contain entity-specific rules such as "Principals cannot select themselves".

## Date and duration fields

`date` and `duration` remain separate canonical values. Components such as `date-duration-range` can compose several fields to help a user maintain start/duration/end semantics while each field retains its own CTX/value ownership.

The expression functions `CalendarAddDuration` and `CalendarDurationBetween` provide calendar-aware arithmetic rather than approximating months/years as fixed day counts.

## Picture and rich-text fields

Picture and rich-text types have specialized components because their interaction state is richer than a simple text input. Nevertheless, their **canonical current value belongs to the entry field CTX owner**. Private cropper/editor state is implementation bookkeeping and must not become a second semantic value authority.

Rich-text and picture components therefore project changes into the same generic field-state/mutation path used by other field types.

## Read-only and application-managed values

`readOnly` says a normal client must not offer direct editing. `generated` identifies storage/system-generated values. `applicationManaged` identifies persisted values maintained by application/domain logic rather than ordinary CRUD callers.

Effective UI metadata can make an otherwise editable field read-only for a specific surface. It cannot safely turn a canonically protected/sensitive field into a normal editable value.

## Field components and CTX

The entry runtime owns canonical live/baseline/validation state. Field components:

1. receive the resolved canonical/effective field definition;
2. render the type-appropriate interaction;
3. publish candidate changes through the canonical field mutation path;
4. receive runtime projection when canonical CTX state changes;
5. expose type-specific interaction without becoming an independent value store.

See [Field Components](Field-Components-Detail.md).

## Extending the field type vocabulary

Adding a new canonical type is a framework-level change. It requires reviewing:

- shared `SysBOFieldType` and value/metadata semantics;
- API serialization, validation and storage projection;
- every supported client renderer/editor;
- list/reference/summary presentation;
- CTX field projection and mutation;
- tests and documentation.

If the requirement is only a new **value source** or a reusable combination of existing fields, prefer a calculation or component rather than creating a new canonical field type.
