# ManatOS Metadata-Driven UI Usage Guide

This guide shows how to use the current ManatOS metadata-driven SysBO UI architecture. It is intentionally focused on reusable patterns: canonical BO metadata, CTX-driven calculations, field-components, UI-components, related collections, developer inspection, and platform-owned UI code.

## 1. Golden rule

Business meaning belongs in canonical metadata and domain services. Presentation belongs in UI metadata. Reusable controls belong in `components/sysbo/entry/fields/` or `ui-components/`. Generic renderers must not branch on concrete entity keys when the behavior can be expressed through metadata.

A reusable UI component may arrange canonical fields, but it must not own business calculations for those fields.

## 2. Canonical field types

Canonical fields are declared in shared BO metadata. Current reusable field types include:

- `string`
- `email`
- `date`
- `datetime`
- `number`
- `boolean`
- `enum`
- `reference`
- `duration`
- `version`

`date` is calendar-date only. `datetime` keeps date plus time. `duration` is a structured calendar value rather than a scalar number. `version` is a canonical version value; the first reusable grammar is numeric semantic versioning (`major.minor.patch`).

Example duration field:

```ts
validityDuration: {
  key: 'validityDuration',
  label: 'Validity duration',
  type: 'duration',
  order: 75,
  nullable: true,
  durationUnits: ['years', 'months', 'days'],
}
```

The canonical duration value is conceptually:

```ts
{
  years: 1,
  months: 2,
  days: 10,
}
```

Calendar duration must not be flattened to an arbitrary number of days. Years and months retain calendar meaning.

## 3. Canonical editable-field calculations

A normal field can remain user-editable and still define a canonical calculation. This is different from a non-editable `derivedField`.

Use `calculation.expression` for the formula and `calculation.triggeredBy` to declare which direct/user-authoritative field changes may recalculate the target.

License example:

```ts
validityDuration: {
  key: 'validityDuration',
  label: 'Validity duration',
  type: 'duration',
  order: 75,
  nullable: true,
  durationUnits: ['years', 'months', 'days'],
  calculation: {
    expression: 'CalendarDurationBetween(validFrom, validUntil)',
    triggeredBy: ['validUntil'],
  },
},

validUntil: {
  key: 'validUntil',
  label: 'Valid until',
  type: 'date',
  order: 80,
  nullable: true,
  calculation: {
    expression: 'CalendarAddDuration(validFrom, validityDuration)',
    triggeredBy: ['validFrom', 'validityDuration'],
  },
},
```

The important part is that the calculation belongs to the fields, not to the visual component that happens to display them together.

### Causal CTX behavior

When a user changes a field, that field is the authoritative cause for the recalculation chain. Dependent writes preserve the original cause. A calculated write does not become a new user-authoritative trigger.

For the License example:

- change `validityDuration` -> `validUntil` recalculates;
- change `validFrom` -> `validUntil` recalculates;
- change `validUntil` -> `validityDuration` recalculates.

The generic CTX/evaluator pipeline owns dependency propagation and cycle/runaway protection. UI components must not implement private settling loops or component-local calculation engines.

## 4. Field-components

Entity-field controls live under:

```text
ui/views/components/sysbo/entry/fields/
```

`form-field.ejs` supplies the form-field wrapper/lifecycle context and delegates to `entity-field.ejs`. `entity-field.ejs` is the single canonical field-type dispatcher and chooses the concrete component from `field.type` only. A field-component owns field-specific interaction and presentation, not entity-specific business logic.

Examples include text, date, datetime, enum, reference, number, boolean, duration and version field components.

### Field tool button

Every enhanced entity-field component may expose the compact field-tools menu. Non-mutating actions remain available for read-only fields; mutating actions are disabled or omitted according to field state.

Typical actions include:

- Copy current value
- Trim spaces
- Clear value
- Today / Now
- Zero / Toggle
- Inspect current field value in CTX Viewer (developer mode only)

The tool-button/menu color is field-type specific; read-only/calculated fields use one common read-only tone. These colors are theme-owned and differ between the Lighter and Darker Preferences themes.

Field inspection opens the Developer Tools dock on the CTX Viewer tab, selects the exact CTX value node, and expands it when appropriate. Calculated-expression rows additionally expose separate **Inspect formula in CTX Viewer** and **Inspect current value in CTX Viewer** actions so definition and live value are never conflated.

## 5. UI-components

Reusable non-field or compound visuals live under:

```text
ui/views/components/
```

Use UI-components for layout/composition or reusable visual behavior that is not itself a canonical field. Ordered form content may also use renderer-neutral layout primitives such as `break` (start the next row) and `spacer` (reserve grid width); neither carries field/data semantics.

Examples include:

- `date-duration-range`
- `related-collections`
- `contextual-help`
- `list-filters`
- `debugging-panel`
- credential-pair workflows

### Compound components must compose field-components

A compound component should render canonical fields through the normal field-component infrastructure. It must not duplicate their native controls.

The License `date-duration-range` component is a layout example. It binds three existing canonical fields:

```ts
{
  kind: 'component',
  span: 12,
  component: {
    key: 'date-duration-range',
    readOnly: false,
    options: {
      startField: 'validFrom',
      durationField: 'validityDuration',
      endField: 'validUntil',
    },
  },
}
```

The component only controls layout. Its calculation semantics remain in canonical field metadata.

### Transient workflow controls

A compound workflow may contain temporary browser inputs that are deliberately not canonical entity fields (for example a plaintext credential that is sent only through a trusted credential command). Such controls must opt out of `data-ctx-field` binding. They may use field-component presentation, but must not fabricate a `ctx.page.page.fields.<name>` node for transient or sensitive workflow state.

## 6. Related-reference selector fields

A `reference` field uses the common `reference-select.ejs` related-entry component. Every real referenced record is presented through that record's canonical entry representation: its resolved entry icon(s), followed by its canonical entry name. This is the same rule for the current selection and for every dropdown option, and it also applies when the reference is calculated/read-only. A composed entry representation may therefore show both the referenced entity cue and its semantic type cue (for example Principal entity + Principal type). Sentinel choices such as `None`, `Choose...`, or `All` stay iconless so they remain visually distinct from real records.

The owner projects the referenced records and their resolved entry representation into the selector; the component never performs entity-specific lookups or API calls. This applies generically to Principal parent/root references, License customer/application selection, and future related-entry selectors.

## 7. Related collections

Read-only related-record panels/tables are rendered by the common `related-collections` UI-component rather than by entity-specific EJS.

Current examples include:

- User -> External identities
- Application -> Licenses
- Principal -> Licenses

Every real row remains ordinary domain data. At render time the common `related-collections` component combines that row with the related entity's already-available canonical/UI metadata and resolves the same canonical entry representation used by lists and reference selectors. The component renders the resolved entry icon composition before the row's primary displayed value; routes must not decorate rows with synthetic `__entryName` / `__entryIcons` presentation properties. `rowIcon` remains a legitimate collection-level metadata override and otherwise the collection icon supplies the entity cue.

Field-specific presentation remains independent. For example, an External Identity row may display:

```text
[External Identity entry icon] [Microsoft provider icon] Microsoft [account/status fields]
```

The first icon group identifies the related entry and is owned by the generic related-entry presentation component used by `related-collections`; the provider icon comes from canonical option presentation for the provider field. The Account authentication projection reuses the same metadata/entry-icon presentation rather than rebuilding External Identity icons or provider labels itself. Likewise, Principal/Application License rows obtain their License entry icon through the same component-level rule. This separation is especially important for future heterogeneous related collections.

## 8. List-page reusable UI

Generic SysBO lists consume UI metadata for:

- visible fields;
- sorting;
- filters;
- add action;
- row actions;
- paging;
- optional list notice/banner.

The Filters panel is a common UI-component. Entity-specific list renderers should not be introduced when the generic metadata contract can express the behavior.

List Add policy uses the same dynamic-value contract as other metadata decisions. A normal Add action can declare:

```ts
addAction: {
  visible: { expression: 'permissions.create === true' },
  enabled: true,
  label: 'Add new',
}
```

A route may project neutral runtime facts needed by policy, but must not decide the UI result itself. For example, External Authentication derives `addConstraintReached` from the current provider data, while metadata declares `enabled: { expression: 'addConstraintReached !== true' }` plus the disabled reason.

## 9. Declarative UI decision values

Use `ManatOSDynamicValue<T>` whenever a framework-neutral metadata property may be either static or evaluator-backed:

```ts
type ManatOSDynamicValue<T> = T | Readonly<{ expression: string }>;
```

`SysBOUIDynamicValue<T>` is an alias for that generic contract. The ownership rule is:

```text
CTX/runtime facts -> metadata policy -> evaluator -> resolved renderer state
```

Do not put presentation decisions into CTX. Prefer facts such as `permissions.create`, `mode`, `user.permissions.platforms.protocrm.capabilities.platformAccess` or `addConstraintReached`; let metadata decide `visible`, `enabled`, `disabledReason`, `editable`, etc.

Standard entry actions illustrate the pattern:

```ts
delete.visible = { expression: "mode !== 'create' && permissions.delete === true" }
save.visible   = { expression: "mode !== 'view' && (permissions.create === true || permissions.update === true)" }
```

Entity-specific policy may add evaluator-backed `enabled` and `disabledReason` without teaching the renderer about that entity. UI policy is not authorization: API/domain permission checks remain mandatory.

## 10. Debugging tab

Developer mode adds the read-only **Debugging** tab to metadata-driven entry forms.

The tab discovers calculations from metadata and displays:

- element/path;
- calculation formula;
- current value.

Inside Debugging, two nested provenance tabs keep the diagnostic surface readable:

- **Entity** contains canonical/entity-field calculations and related-entity calculations;
- **UI** contains UI metadata expressions such as field overrides, tab visibility, related presentation, and entry actions.

The split is generic and provenance-driven; it must not depend on a concrete SysBO key.

Canonical editable-field calculations appear as entity-field calculations, not as UI-component calculations.

Calculation rows have a compact tools button with two precise actions when both targets exist: **Inspect formula in CTX Viewer** selects the expression/definition node, while **Inspect current value in CTX Viewer** selects the live calculated value node. The action carries the exact CTX path and must not fall back to the owning page node.

The browser consumes ManatOS' precompiled expression AST. It must not repeatedly parse the expression source string for reactive recalculation.

## 11. CTX runtime/developer facts

Runtime facts belong under `ctx.system`. Developer-mode decisions should be represented as CTX facts rather than independently re-derived in unrelated UI features.

Current runtime facts include the environment/runtime mode and developer-mode status. Developer-only surfaces should use the same resolved fact consistently:

- CTX Viewer;
- developer/debug menu;
- entry Debugging tab;
- exact formula/value inspection actions from field/debug rows.

The CTX Viewer manages focus correctly when opening/closing and keeps hidden controls inert so accessibility state does not conflict with keyboard focus.

## 12. Delete-impact and dirty deletion

Existing records use the generic `$delete-impact` preflight before destructive deletion.

The modal reports relationship consequences such as:

- no related impact;
- cascade deletion;
- unlink;
- set-null;
- retained related records;
- restricted deletion.

If the entry form contains unsaved changes when Delete is requested, the modal additionally warns that both the unsaved edits and the saved record will be lost.

## 13. Preferences themes

The Preferences popup supports Lighter and Darker themes. Theme-specific tokens own the field-component palette rather than field components hard-coding colors.

Selecting a theme displays a preview grid inside the popup before Save, including representative header/title/field surfaces. The website theme itself is not committed until the user saves preferences.

## 14. Contextual help

Use the generic `contextual-help` UI-component whenever a selected CTX/metadata value chooses one of several help blocks.

The component must not be named for or know about the owning entity. External-authentication provider setup guidance is one consumer of this generic mechanism. Provider General help and Secrets help are separate declarative payloads and both reuse the same `contextual-help` component.

## 15. External authentication provider executable boundary

Provider labels, icons, callback/help/configuration presentation should be declarative where practical. Executable OAuth differences remain provider adapters under:

```text
ui/src/auth/providers/
```

The generic registry selects the adapter. Provider files should contain only behavior that is genuinely executable/provider-specific, such as Passport strategy construction or native profile normalization.

Do not move executable strategy constructors into metadata.

## 16. Platform-owned code

Platform-specific feature code belongs below explicit platform folders.

For protoCRM:

```text
shared/src/platforms/protocrm/
ui/src/platforms/protocrm/
ui/views/pages/platforms/protocrm/
ui/public/assets/platforms/protocrm/
ui/public/css/platforms/protocrm.css
```

Generic routers/renderers should compose platform modules and must not accumulate protoCRM-specific branches.

`app-playground.ejs` is the protoCRM Apps Playground landing/workspace. `application-playground.ejs` is the workspace for one selected SysApplication.

## 17. Adding a new metadata-driven field

1. Add the canonical field to shared BO metadata.
2. Use an existing canonical field type whenever possible.
3. If a new field type is genuinely reusable, extend the shared type contract and add one generic field-component.
4. Add UI metadata only for presentation/layout differences.
5. Add canonical `calculation` metadata when a user-editable field is recalculated from other fields.
6. Keep calculation semantics out of UI-components.
7. Add contract/regression coverage for the generic behavior, not only the first entity using it.

## 18. Adding a reusable UI-component

1. Place it under `metadata-driven/ui-components/`.
2. Give it a semantic, entity-independent key/name.
3. Bind fields/data through metadata options/bindings.
4. Reuse canonical field-components internally when displaying editable entity fields.
5. Keep business calculations/domain decisions outside the component.
6. Register the component through the shared metadata-component registry.
7. Add regression coverage proving the generic renderer remains entity-agnostic.

### Dynamic grid spans

Metadata-driven tab content may use a static grid span or an evaluator-backed span expression. Use this for conditional layout such as letting one field consume the complete row when its neighbour is not visible. The generic renderer evaluates and clamps the span to the 1..12 grid; entity/components must not hard-code layout branches.

### Collapsible contextual help

The generic contextual-help/information-panel component remains expanded by default. Individual metadata declarations may opt into `initiallyCollapsed: true`. Collapsible panels display a generic chevron beside the title so expandability is visible without entity-specific markup.

### Provider credential-test callback resilience

Credential testing remains provider-neutral. OAuth `state` is the primary callback correlation token; while a short-lived credential test is active, the same-session fresh pending provider/test record is also accepted as a fallback when a provider/strategy omits the returned state value. No provider name is hard-coded into the callback router for this behavior.

## 19. Verification

After applying source changes, run from the repository `src` root:

```powershell
npm run verifyrun
```

The full authoritative repository verification remains a local checkout step. A successful run builds Shared/API/UI, runs all API/UI tests, and starts ManatOS only after verification succeeds.

### External-provider credentials are a compound command

External-provider `clientId` + secret changes are not ordinary SysBO CRUD. The
credential component explicitly marks a credential mutation; ordinary entry
saves (for example toggling `enabled`) leave the stored credential pair
untouched. Safe provider capabilities are consumed from the selected enum
option/definition (`provider.option.*`), while plaintext secrets never enter
CTX. Provider-specific literals must not be introduced into generic renderers
or the compound credential runtime.

## External-provider screen transaction

External-provider credential tools follow the same entry transaction as ordinary metadata-driven fields. `Change credentials` and `Remove credentials` mutate only pending screen/component state. `Test credentials` may perform the external OAuth round trip, but it does not persist the candidate pair; success returns an opaque, short-lived verification proof that is submitted by the ordinary Save action. Save is the sole credential persistence boundary and applies `unchanged`, `replace`, or `remove` atomically from the editor's pending intent.

The plaintext Client secret remains confined to the password control and the short-lived trusted server verification session; it is deliberately not copied into the traversable CTX tree. Safe workflow facts (credential action, verification state/proof handle) are transient screen state and must never be treated as persisted SysBO fields. Provider-specific capabilities remain provider-definition metadata; generic renderer/component code must not branch on Microsoft/Google/Facebook/GitHub identities.

## Transactional editable collections

Use the generic `collection-editor` UI component for small metadata-declared child/relationship collections that must participate in the owning entry's Save/Cancel transaction. The component must remain entity-agnostic: item entity, relationship entity, owner/target fields, canonical field type, duplicate comparison and selection behavior are metadata options.

The Principal Contact tab uses this pattern for three canonical contact kinds:

- `SysEmailAddress` + `SysPrincipalEmailAddress`
- `SysTelephoneNumber` + `SysPrincipalTelephoneNumber`
- `SysAddress` + `SysPrincipalAddress`

Principal Save performs resolve-or-create plus association synchronization atomically. Removing a contact value from one Principal removes only that association and never deletes a shared canonical value.

Metadata-driven field captions use one universal editing language: labels end with `:`, required fields append `(*)`, and requiredness alone does not bold the marker. A changed field bolds the entire label (including `(*)` when present) and the changed value; reverting to the persisted/current baseline removes that emphasis. Collection editors follow the same convention.
