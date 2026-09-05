# Entity metadata and entry representation

This document defines the current ManatOS metadata contracts for first-class SysBO entities and the reusable rules used to represent one entity entry in lists, references, breadcrumbs, hierarchy/graph visualizations and future metadata-driven components.

The governing rule is that entity/business semantics live in canonical metadata, presentation choices live in UI metadata, and reusable renderers consume those contracts without entity-name hardcoding.

## 1. Canonical entity metadata

A first-class `SysBOMetadata<T>` currently supports these top-level structures:

```text
key
name
pluralName
primaryField
exposure?              // SysBO only: standard | internal
entry?                 // reusable one-entry semantic representation
relationships?
fieldDefinition
```

`key` is the stable metadata identity. `name`/`pluralName` describe the entity itself. `primaryField` remains the main canonical identifying field used by generic persistence/reference infrastructure; it is not necessarily the same thing as the human entry caption.

`entry` is optional. Omitting it does not make an entity invalid: generic fallbacks are applied as described below.

## 2. Canonical `entry` metadata

The canonical entry contract is:

```ts
entry?: {
  name?:        EntryValueSource;
  type?:        EntryValueSource;
  description?: EntryValueSource;
  status?:      EntryValueSource;
}
```

Each `EntryValueSource` is one of:

```ts
{ field: 'fieldName' }
```

or:

```ts
{ expression: "ManatOS expression" }
```

### 2.1 Formula-first rule

Use a direct `field` source when the semantic value is genuinely one canonical field. Prefer an `expression` whenever representation is calculated from multiple fields or conditions.

Preferred:

```ts
entry: {
  name: { expression: "firstName + ' ' + lastName" }
}
```

Avoid inventing secondary concatenation metadata such as `fields: [...]` plus `separator`. String composition, conditionals, null handling and future richer rules already belong to the ManatOS expression language.

A simple expression such as:

```ts
type: { expression: 'principalType' }
```

is treated as a direct field expression for metadata discovery, so enum/reference metadata can still provide type captions, icons and traits.

### 2.2 `entry.name`

`entry.name` is the reusable human-facing identity of one record. Lists and visualizations should ask the entry-representation resolver for this value instead of assuming `record.name`.

Default order when omitted:

1. canonical field `name`, if present;
2. `primaryField`.

`primaryField` is deliberately retained as a separate canonical concept. For example, an entity may use `code` as its primary field while displaying `code + ' - ' + description` as its entry name.

### 2.3 `entry.type`

`entry.type` is an optional semantic classifier for an entry. It may be an enum field, reference field, calculated field or expression.

If omitted, an exact canonical field named `type` is used when present; otherwise the entity has no generic entry type.

For enum-backed types, the matching `enumItems[]` record supplies the generic type label/icon/traits.

For reference-backed types, the current owner supplies the reference catalogue. Entry representation resolution itself never performs I/O.

### 2.4 Relationship expressions

Relationship projections are exposed to entry expressions under the reserved `relations` object, keyed by the canonical relationship metadata key:

```ts
relationships: {
  customerType: {
    fields: ['customerTypeId'],
    references: { objectKey: 'customer-types', fields: ['id'] },
    cardinality: 'many-to-one'
  }
},

entry: {
  type: { expression: 'relations.customerType.name' }
}
```

This is preferred over inventing special expression syntax such as `relation[entity].field`. The normal ManatOS path grammar is sufficient, the relationship key is canonical and unambiguous, and the evaluator does not need a second parser.

A renderer/owner that wants to evaluate a relationship expression must provide the referenced relation projection. The resolver must not fetch it itself.

## 3. Calculated-field ordering

Renderable calculated values are ordinary canonical `fieldDefinition` entries. Their normal `type` selects the field-component; `calculation.expression` only supplies the value:

```ts
fieldDefinition: {
  fullName: {
    key: 'fullName',
    label: 'Full name',
    type: 'string',
    order: 40,
    readOnly: true,
    calculation: {
      expression: "firstName + ' ' + lastName"
    }
  }
},
entry: {
  name: { expression: 'fullName' }
}
```

Entry formulas inject canonical calculated fields into the evaluator scope lazily. Dependencies between calculated fields therefore use the normal evaluator ordering/cycle rules. A calculated field is not declared again in a parallel derived-field catalogue.

`calculation.persisted: true` materializes an authoritative calculated value before API/domain commit. `calculation.triggeredBy` is reserved for editable assisted calculations whose recalculation is causally driven by specific direct/user-authoritative fields.

Expressions are parsed/compiled before repeated browser evaluation. Browser renderers consume the compiled AST; they must not reparse formula strings for every row/node redraw.

## 4. UI metadata

Current `SysBOUIMetadata` supports:

```text
key
entry?                 // presentation of one entity entry
list
recordQuick?
record
```

`entry` is presentation metadata for an individual record and is deliberately distinct from the entity/page icon.

### 4.1 Entity icon versus entry icon

The routed SysBO definition currently owns the entity/page/navigation icon (`SysBODefinition.icon`). It identifies the entity itself in navigation, page titles and entity-level chrome.

`uiMetadata.entry.icon` identifies how individual entries should appear in lists and visualizations. Changing it must never mutate the entity icon.

Supported entry icon modes:

```ts
{ mode: 'entity' }
{ mode: 'type' }
{ mode: 'fixed', icon: '...' }
{ mode: 'composed', entityScale?: 0.72, typeScale?: 1.15, typeEmphasis?: 'primary' | 'secondary' }
```

Default behavior is entity icon only when no type icon exists, otherwise composed entity + type.

For Principals the type cue is visually dominant and the entity cue remains smaller/behind it.

### 4.2 Type icon resolution

For an enum-backed type, the resolver uses the matching canonical `enumItems[].icon`.

For a reference-backed type, the owner-provided related row may expose an entry icon (`__entryIcon`), an explicit `icon`, or finally the referenced entity icon (`__entityIcon`). The resolver does not make an API request to discover any of these.

If an arbitrary type expression does not map to a direct enum/reference field, automatic type-icon inference is not guaranteed. UI metadata can then choose entity/fixed presentation or future explicit icon expressions without changing the canonical type semantics.

## 5. Current Principal example

Canonical Principal metadata declares:

```ts
entry: {
  name: { field: 'name' },
  type: { expression: 'principalType' },
  description: { field: 'description' }
}
```

Principal UI metadata declares:

```ts
entry: {
  icon: {
    mode: 'composed',
    entityScale: 0.72,
    typeScale: 1.15,
    typeEmphasis: 'primary'
  }
}
```

The Organization hierarchy no longer owns `labelField`/`typeField` as presentation facts. It receives hierarchy-only structure such as identity, parent/root fields and enum capability traits, while entry caption/type/icon come from the reusable entity-entry contract.

## 6. Universal enum/reference field presentation

Canonical enum-item metadata may declare `label`, `icon`, tone and semantic traits. Entity edit forms never render those icons through entity-specific templates: every ordinary enum field is dispatched through `components/sysbo/entry/fields/enum-select.ejs`, which renders a real selected option and every real dropdown option as icon + label when an icon exists. `Choose...` remains iconless. Contextual enum projections may narrow/enrich the catalogue, but canonical labels/icons survive by value.

Reference fields follow the same ownership rule. `components/sysbo/entry/fields/reference-select.ejs` is the entity-form presenter for related records, including calculated/read-only references. Reference data is projected through the canonical entry-representation resolver (`__entryName`, `__entryIcons`), and the component renders the resolved entry icon composition before the resolved entry name for both the selected value and every dropdown choice. `None` / `Choose...` remain iconless. Callers must not prepend their own entity/reference icons around these components.

## 7. Consumers and fallbacks

The generic entry representation is intended for:

- metadata-driven list primary/clickable captions;
- hierarchy/tree/chart node captions and icons;
- reference/lookup option captions;
- breadcrumbs;
- search/result cards;
- future cards, graph nodes and selectors.

Consumers may temporarily retain a fallback to `primaryField` while being migrated, but must not introduce new entity-specific label/type/icon options when the entry contract already describes the concept.

## 8. I/O and ownership rule

Entry representation is pure metadata + current data + owner-supplied relation/reference data. It does **not** perform API calls.

This is especially important for aggregate workspaces: a hierarchy can contain `draft:*` records and unsaved relationship changes that do not exist in the database. Its labels/types/icons must be resolvable from owner `entries[]` and the already available metadata/reference scope.

`recordQuick` remains a UI projection over the same complete working entry and likewise performs no persistence/API call. Only the owning workspace `Commit` crosses the aggregate persistence boundary.

## 9. Golden rules

1. Do not hard-code entity names in generic entry renderers.
2. Do not duplicate entry naming/type/icon rules in list, hierarchy and lookup components.
3. Prefer canonical formulas over new mini-languages for calculated representation values.
4. Derived entry dependencies remain evaluator-owned and lazily calculated.
5. Parse formulas once; repeated rendering evaluates the canonical AST rather than reparsing strings.
6. Relationship expressions use canonical relationship keys under `relations.<key>`.
7. Presentation components never fetch hidden data merely to resolve an entry caption/icon; owners provide required relation/reference projections.
8. Entity icon and entry icon are separate concepts.
9. `primaryField` and `entry.name` are separate concepts.
10. Future entity support should normally require metadata changes, not generic component edits.

### Semantic type fields need not be named `type`

`entry.type` declares semantic entry type independently of a physical field name. For example, `sys-ext-auth-providers` declares `provider` as its entry type. Because `provider` is an enum whose canonical option items carry Microsoft/Google/Facebook/GitHub icons, the generic entry-representation resolver obtains the provider label and icon from that metadata. UI metadata separately chooses `entry.icon.mode: 'type'`; the routed entity icon remains the entity's globe icon.

Reference fields use the referenced entity's resolved entry representation when reference data is projected into a list/selector. This allows fields such as Principal parent/root references to show the referenced Principal's semantic type icon without Principal-specific rendering code or additional component API calls.


## Authorization is not entity metadata

SysBO/entity metadata describes domain shape and declarative presentation behavior; it is not an authorization-policy store. UI SysBO definitions likewise contain no role/action permission matrices. The API `AuthorizationService` resolves canonical `read`, `create`, `update`, and `delete` capabilities for collection or record scope, and the UI projects those facts into page CTX. Platform entitlement is resolved the same way through the API platform-capability contract.

Metadata expressions may consume resolved capability facts such as `permissions.update` or `user.permissions.<platform>.capabilities.platformAccess`, but they do not grant access and must not reconstruct policy from user roles, license records, or client-posted CTX. Genuine role-specific presentation can still use `user.permissions.userRole` when the role itself is what is being presented.
