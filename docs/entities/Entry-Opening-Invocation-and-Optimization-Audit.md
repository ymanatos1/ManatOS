# Entry Opening, Invocation and Optimization Audit

**Audit snapshot:** `src(20260915-232715)`  
**Status:** historical baseline plus live implementation tracker. The original matrix below records the `src(20260915-232715)` opening paths. As of 2026-09-16, consolidation Phase A is implemented: browser callers now use one normalized semantic entry-opening contract and one routed-popup transport projection. Effective-view resource planning (B1) is now implemented; request-scoped deduplication (B2) is implemented; B3 process/versioned metadata-cache evaluation is complete and deliberately retains request-scoped caching because no explicit metadata version/invalidation contract exists; post-A+B acceptance/performance instrumentation is implemented; direct-host evaluation remains subsequent.

## Current implementation status (2026-09-16)

The audit remains relevant, but it must not be read as a description of every current call site. Since the snapshot:

- recursive UI-level hosting is established for page, popup and embedded surfaces;
- embedded related-collection child entries use the direct child-surface path;
- metadata list actions can declare generic `open-entry` intent, including the standard Quick View action;
- named read-only `quickView` UI views are being adopted across system entities;
- **implemented (A1/A2):** canonical browser `openEntry(...)` normalization and centralized token/`_entry*` transport projection for metadata list actions, semantic entry links, related-entry links, reference-field view/create actions, hierarchy member view and hierarchy quick-create;
- **implemented (A3):** generic caller-rule composition for defaults, fixed values and UI restrictions before transport projection;
- **implemented (B1):** the resolved effective ui-view is recursively planned for field/reference, related-collection, component and entry-action resource demand before supplemental loading; static hidden tabs and omitted quick-view content no longer cause unrelated reference/collection/delete-impact/hierarchy work;
- **implemented (B2):** request-lifetime promise deduplication now shares identical canonical metadata, UI-metadata, raw reference-catalogue/unique-through and capability GETs within one Express request only; rejected reads are evicted and source-record-specific reference projection remains outside the cache;
- **B3 — evaluated:** do not add a process metadata cache yet. Canonical metadata reads remain request-scoped until the API exposes an explicit metadata version/invalidation contract;
- **remaining decision (D1/D2):** measure the consolidated routed implementation, then remove/bypass iframe/document startup only if direct hosting can preserve identical CTX, validation, persistence, recovery and nesting semantics.

Therefore the detailed matrix remains a historical baseline, not the current caller architecture. Phase A is now the implemented entry-opening contract. The matrix should be removed when the remaining measured optimization phases settle and this document is converted into permanent canonical documentation.

## 1. Purpose

Every metadata-driven entity entry should enter ManatOS through one semantic opening contract. `page`, `popup` and `embedded` are hosting choices; `create`, `edit` and `view` are operation modes; `main`, `account`, `quick` and future keys are UI views. None should require a second implementation of entry defaults, effective metadata, validation, persistence or CTX ownership.

This audit answers five questions before entry-popup optimization begins:

1. Which entry-opening cases exist in the current application?
2. What does each caller actually supply today?
3. Where is the same invocation information encoded more than once?
4. Which work on the opening path is necessary, reusable, cacheable or avoidable?
5. What single entry-opening contract can replace caller-specific assembly without changing semantics?

The optimization objective is not merely fewer spinners. It is the shortest safe path into the same canonical entry runtime, with fast openings revealed atomically and slow/remote work represented only when it is genuinely necessary.

## 2. Orthogonal opening dimensions

An entry opening is the combination of independent dimensions:

| Dimension       | Current values / examples                                                 | Meaning                                                                                                       |
| --------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Host            | `page`, `popup`, `embedded`                                               | Mounting/lifecycle and parent activation.                                                                     |
| Kind            | `entry`                                                                   | Semantic surface kind. Selectors/hierarchies are different kinds even when they can originate entry openings. |
| Mode            | `create`, `edit`, `view`                                                  | Entry operation semantics. Authorization may narrow edit to view.                                             |
| UI view         | `main`, `account`, `quick`, future keys                                   | Named effective entry presentation.                                                                           |
| View type       | `full`, `quick`, future types                                             | UI-view family, not a host.                                                                                   |
| Density         | `normal`, `compact`                                                       | Host/presentation density. It must not redefine entry semantics.                                              |
| Data mode       | persisted/API, owner-managed local aggregate, embedded local child        | Where the initial record and eventual persistence responsibility live.                                        |
| Recovery        | recoverable / non-recoverable                                             | Whether user-change recovery participates for this opening.                                                   |
| Caller rules    | defaults, fixed values, UI/option restrictions                            | Caller-local narrowing layered over canonical metadata.                                                       |
| Result behavior | navigate, save-and-stay, return result/close, parent-owned reconciliation | What the caller does with the completed child operation.                                                      |

The architecture already has one recursive UI-level host authority. This audit concerns the remaining layer above it: **semantic entry opening and invocation normalization**.

## 3. Current server invocation envelope

`ui/src/routes/sysbo/entry/invocation.ts` currently parses this route/form envelope:

| Transport field     | Parsed meaning                              | Default           |
| ------------------- | ------------------------------------------- | ----------------- |
| `_entryPopup`       | popup-hosted routed entry                   | false             |
| `_entryPopupToken`  | popup correlation/result token              | null              |
| `_entryMode`        | explicit `create`, `edit` or `view` request | null              |
| `_entryUIView`      | requested named UI view                     | null/default view |
| `_entryDensity`     | `compact` or normal density                 | `normal`          |
| `_entryRecoverable` | participation in popup recovery             | true              |
| `_entryDefaults`    | caller-projected initial values             | `{}`              |
| `_entryOverrides`   | caller-local field UI/option restrictions   | `{}`              |

The browser popup opener separately receives `url`, `token`, `title`, `entityKey`, `mode`, `invocation`, optional POST `request`, `onSaved` and `onClose`. Consequently a caller can currently encode the same fact in multiple places: for example mode in the URL/form envelope and in `popup.open({ mode })`, or density/UI view in transport fields while presentation/provenance live in the browser invocation.

## 4. Exhaustive current entry-opening matrix

“Caller parameters” below means the information assembled at the immediate opening boundary in this snapshot, not the proposed target API.

| ID      | Current opening                                   | Host / mode / UI view                                  | Immediate caller                                             | Caller parameterization today                                                                                                                                                                                      | Data / persistence                                                          | Current path                                                                          |
| ------- | ------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **P1**  | Generic Add new                                   | page / create / default                                | entity list/navigation → `GET /bo/:key/new`                  | entity key in route; normally no `_entry*` envelope                                                                                                                                                                | new API-backed entity                                                       | route → generic record renderer → browser entry runtime                               |
| **P2**  | Generic existing entry                            | page / edit-or-view / default                          | entity list/direct link → `GET /bo/:key/:id`                 | entity key + record id; permission determines edit/view unless view is forced                                                                                                                                      | persisted API record                                                        | route → record fetch + generic renderer → browser entry runtime                       |
| **P3**  | Explicit view-only existing entry link            | page semantics, may later be popup-intercepted / view  | related/read-only link                                       | record URL plus `_entryMode=view`                                                                                                                                                                                  | persisted API record                                                        | generic existing route with invocation narrowing                                      |
| **P4**  | Account entry                                     | page / edit-or-view / `account`                        | Account system route                                         | server surface request supplies `purpose='open-account-entry'`, `uiViewKey='account'`; record identity is current user                                                                                             | persisted SysUser                                                           | account route → same generic record renderer                                          |
| **O1**  | View selected reference                           | popup / view / default                                 | reference field `view-entry`                                 | caller builds token + `_entryPopup=1` + `_entryPopupToken` + `_entryMode=view`; also passes popup title/url/entityKey/mode and invocation `purpose='view'`                                                         | persisted target record                                                     | field runtime → entry popup → iframe GET → generic record route                       |
| **O2**  | Generic Add referenced entry                      | popup / create / default                               | reference field `add-entry` without relationship projections | `_entryPopup=1` + token + serialized empty/default caller rules; popup title/url/entityKey/mode + invocation purpose                                                                                               | new API-backed target                                                       | field runtime → entry popup → iframe GET `/new`                                       |
| **O3**  | Add related entry with projected defaults         | popup / create / default                               | reference field with `createRelated.defaults`                | O2 plus `_entryDefaults` copied from source entry                                                                                                                                                                  | new API-backed target                                                       | same as O2; caller defaults layer after canonical defaults                            |
| **O4**  | Add related entry with fixed values               | popup / create / default                               | reference field with `createRelated.fixedValues`             | O3 plus fixed value in defaults and `_entryOverrides[field]` with `editable:false` + `readOnlyValue`                                                                                                               | new API-backed target                                                       | same generic target entry; restriction is invocation-local                            |
| **O5**  | Add related entry with option-domain restrictions | popup / create / default                               | reference field with `createRelated.uiOverrides`             | O2/O3 plus `allowedValues` and/or `allowedEnumItemTrait` inside `_entryOverrides`                                                                                                                                  | new API-backed target                                                       | generic entry policy reconciles legal option domain after canonical defaults          |
| **O6**  | View hierarchy member                             | popup / view / default                                 | non-workspace hierarchy tree                                 | token + popup/mode URL fields; popup title/url/entityKey/mode + `purpose='view'`                                                                                                                                   | persisted target record                                                     | hierarchy runtime → same entry popup/iframe route                                     |
| **O7**  | View related-collection row                       | popup / view / default                                 | delegated `data-related-entry-view-popup` click              | link may already carry `_entryMode=view`; delegated handler adds popup/token/mode again and passes popup descriptor                                                                                                | persisted related record                                                    | delegated handler → same entry popup/iframe route                                     |
| **O8**  | Nested entry popup                                | popup / underlying mode/view / underlying UI view      | entry hosted inside another popup                            | same descriptor/envelope as O1–O7; hosted document delegates `ManatOS.popup.entry.open()` to owning window                                                                                                         | same as underlying case                                                     | outer window owns popup stack; semantic case should be depth-invariant                |
| **O9**  | Hierarchy quick create                            | popup / create / `quick`, compact                      | hierarchy workspace                                          | popup descriptor has purpose `hierarchy-quick-entry`, `uiViewKey='quick'`; POST request repeats popup/token/mode + `_entryUIView=quick` + `_entryDensity=compact` and owner snapshot/context fields                | owner-managed in-memory aggregate; save returns to owner, not ordinary CRUD | hierarchy workspace → entry popup → iframe POST `/owned-entry/:id` → generic renderer |
| **O10** | Popup save-and-stay                               | popup / create→edit or edit / same UI view             | hosted entry save                                            | server continuation preserves popup/token, UI view, density, recoverability, defaults and overrides; mode becomes edit                                                                                             | persisted/owner-managed according to route                                  | save → continuation render in hosted document                                         |
| **O11** | Popup save-and-close/result                       | popup / create-or-edit / same UI view                  | hosted entry save                                            | token identifies parent result channel; browser receives saved id/record/representation                                                                                                                            | caller reconciles returned semantic result                                  | hosted entry posts `manatos:entry-popup-saved`; outer host closes when requested      |
| **O12** | Popup cancel/close                                | popup / any                                            | popup close or hosted Cancel                                 | token/cancel result; recoverable editable popup first delegates cancellation to hosted entry                                                                                                                       | no successful mutation                                                      | outer host closes descendants, disposes UI level, restores parent                     |
| **O13** | Popup recovery/reopen                             | popup / remembered mode / remembered view              | workspace recovery runtime                                   | recovery descriptor stores URL/title/entity/mode/invocation/request; restore creates a new token and re-adds popup transport fields                                                                                | reopens semantic surface then reapplies captured user changes               | sequential popup restoration through the same popup opener                            |
| **E1**  | Related collection item create                    | embedded / create / item entity view semantics         | collection editor                                            | direct `openChildSurface`: parentPath, host, kind, mode, entityKey, local entry record, `purpose='edit-related-collection-item'`, `dataMode='local'`, `persistenceOwner='parent'`, collection key, non-recoverable | local child; parent collection owns commit                                  | no iframe/route round trip; child UI level is created directly                        |
| **E2**  | Related collection item edit                      | embedded / edit / item entity view semantics           | collection editor                                            | same as E1 plus record id and original/current local record                                                                                                                                                        | local child; parent collection owns commit                                  | same direct child-level path                                                          |
| **R1**  | Failed create save re-render                      | original page/popup host / create / same UI view       | server save error path                                       | submitted record + retained form `_entry*` invocation fields                                                                                                                                                       | unsaved submitted values remain current                                     | generic renderer re-renders; create defaults must not overwrite submitted values      |
| **R2**  | Failed existing save re-render                    | original page/popup host / edit-or-view / same UI view | server save error path                                       | submitted record + retained form `_entry*` invocation fields                                                                                                                                                       | persisted baseline + submitted current values                               | generic renderer re-renders without replaying create semantics                        |

Selectors are intentionally not classified as entry openings. They are `kind='selector'` child levels that can return a record identity or originate a later entry operation. Hierarchy workspaces are likewise separate kinds; O9 is the full entry they open for an owner-managed member.

## 5. Current caller-rule composition

The relationship-aware reference caller currently derives three distinct semantic inputs from metadata:

| Input                  | Source                      | Meaning                                                                                                                  |
| ---------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Caller defaults        | `createRelated.defaults`    | Copy source values into the new target's initial values.                                                                 |
| Fixed values           | `createRelated.fixedValues` | Copy source values and also narrow target editability through invocation-local UI override.                              |
| UI/option restrictions | `createRelated.uiOverrides` | Narrow effective target presentation or legal option domain (`editable`, `allowedValues`, `allowedEnumItemTrait`, etc.). |

These are valid semantic distinctions and should survive consolidation. What should disappear is caller-specific transport assembly and duplicated representations of those facts.

## 6. Current initialization and authority invariants

Optimization must preserve these invariants:

1. **One semantic entry implementation.** Page, popup and embedded hosts must not acquire separate default/calculation/validation implementations.
2. **Canonical metadata remains authoritative.** Invocation may narrow presentation/legal choices but must not bypass canonical entity/domain restrictions.
3. **UI view resolution precedes invocation-local UI overrides.** A caller constrains the selected effective view; it does not mutate canonical metadata.
4. **Persisted/server values are factual input.** Create defaults do not overwrite submitted failed-save values or existing persisted values.
5. **Caller defaults are initialization input, not a second metadata definition.** They layer after canonical create defaults and before final dependency/calculation settling.
6. **Option restrictions and value defaults remain distinct.** Restricting an option domain must be reconciled generically; concrete callers must not invent entity-specific legal-value rules.
7. **Initialization settles before the clean baseline.** Defaults/calculations are not user edits.
8. **Authorization can only narrow requested mode.** A caller cannot force edit capability the user does not possess.
9. **One CTX semantic owner per entry.** The outer iframe popup level owns host/provenance; the hosted entry document owns its live entry fields. Optimization must not copy those fields into a second owner.
10. **Nested depth is semantically irrelevant.** The same opening descriptor must mean the same thing whether called from a page or another popup.
11. **Persistence ownership is explicit.** API-backed, owner-managed aggregate and parent-owned embedded entries must not be conflated.
12. **Recovery is orthogonal.** Removing an iframe or transport step must not silently remove recoverability, navigation restoration or dirty-state protection.

## 7. Current opening cost map

A popup click is currently not just a child-level creation. For an iframe-hosted entry it can involve:

```text
caller
  -> build token + URL/form _entry* envelope
  -> entry-popup.open()
  -> create outer popup CTX level
  -> create hidden/preparing iframe
  -> HTTP GET/POST to UI server
  -> resolve permissions
  -> API $metadata + $metadata-ui
  -> API record fetch for persisted entries
  -> supplemental data
       -> related collections
       -> delete impact when applicable
       -> reference catalogues
       -> referenced UI metadata/representation support
       -> target-entity permissions for references
       -> entity-specific factual support data where declared
  -> optional hierarchy snapshot / parent-list context
  -> server render HTML/bootstrap
  -> iframe parse/load browser entry runtimes
  -> browser defaults/rules/calculations/components initialize
  -> first-paint initialization boundary
  -> postMessage popup-ready
  -> outer popup reveal + size estimate
```

The route deliberately uses canonical API boundaries, which is architecturally correct, but the total work can be disproportionate for a compact quick popup. `editPageSupplementalData()` also prepares resources for the effective entry metadata generally; an optimization must determine which resources the selected UI view actually needs rather than simply deleting calls.

The popup already avoids one visual defect: the outer host begins in a preparing state and only shows its spinner after 220 ms. The hosted entry runtime also releases purely local bootstrap work after the first paint and opens the global busy UI only when remote initialization is actually observed. These are useful protections, but they mask latency rather than removing its causes.

## 8. Redundancy and optimization findings

### A. Semantic entry opening is not yet one function

The repository has one **UI-level host authority**, but entry-opening intent is assembled in several places:

- reference `view-entry`;
- reference `add-entry` / `createRelated`;
- hierarchy member view;
- delegated related-collection row view;
- hierarchy quick owner-managed popup;
- recovery restoration;
- server save-and-stay continuation;
- direct embedded collection editor.

Several callers independently create tokens, URLs, `_entry*` parameters, popup descriptors and invocation fragments. This is the primary consolidation opportunity.

### B. Browser descriptor and HTTP envelope duplicate facts

Popup `mode`, token, UI view/density/recovery and caller rules can be represented in both browser state and transport state. A canonical descriptor should be normalized once and adapters should derive host transport from it.

### C. Compact popup still pays full routed-document startup

`quick` + `compact` changes metadata presentation and geometry, but O9 still creates a same-origin iframe and executes the routed entry pipeline. The iframe is the largest structural opportunity for eliminating navigation/document/bootstrap overhead, provided direct hosting can reuse the exact canonical entry semantics.

### D. Selected UI view can inform resource planning earlier

The server resolves the UI view before supplemental data, which is good. The next optimization is to derive an explicit **resource plan** from the effective view/metadata so a compact view does not fetch resources required only by omitted tabs/components. This must be metadata-driven, never `quick`-specific branching.

### E. Canonical metadata process caching — B3 decision

B3 evaluated process/versioned caching and deliberately does **not** introduce a process cache. The current API metadata endpoints authorize every request and expose canonical metadata, but they do not expose a metadata generation/version token or an invalidation event that the UI process can use to prove freshness. A TTL would only bound staleness; it would not provide the required correctness contract.

Therefore `canonicalSysBOMetadata()` and `canonicalSysBOUIMetadata()` remain request-memoized through the B2 `WeakMap<Request,...>` registry. This removes duplicate reads inside one entry request while guaranteeing that the next Express request crosses the API boundary again. Authorization-sensitive capabilities, records, reference catalogues and other mutable data remain outside any process metadata cache.

A future process cache is permitted only after the API supplies an explicit metadata version/generation identity (or equivalent invalidation contract). Its cache key must include that identity plus the canonical entity/metadata kind, and a generation change must make old entries unreachable without relying on TTL expiry.

### F. Reference support can fan out

Reference preparation can fetch candidate lists, target UI metadata and target permissions for multiple reference fields. The current code already parallelizes some work, but a resource plan and request-scoped deduplication could prevent work for fields/components absent from the selected view and repeated target entities.

### G. Flicker policy should remain threshold-based, not delay-based

Fast openings should be initialized hidden and revealed atomically. No minimum spinner dwell should be imposed on a popup that never required remote initialization. A loading affordance should appear only after a threshold or when genuinely remote initialization becomes observable. Existing 220 ms outer-spinner deferral is directionally correct.

## 9. Target: one canonical entry-opening descriptor

The target is one semantic function/contract, conceptually:

```text
openEntry({
  target: { entityKey, recordId? },
  host: 'page' | 'popup' | 'embedded',
  mode: 'create' | 'edit' | 'view',
  uiView?: { key },
  presentation?: { title?, density?, anchorToTrigger? },
  caller?: { surfaceRef?, entityName?, recordId?, fieldKey?, relationshipKey? },
  rules?: { defaults?, fixedValues?, uiOverrides?, optionRestrictions? },
  data?: { mode: 'api' | 'owner' | 'local', initial?, original?, owner? },
  behavior?: { recoverable?, result?, closeAfterSave? }
})
```

This is a design shape, not a frozen API. The implementation audit during the first consolidation patch should choose names that align with existing canonical invocation/CTX vocabulary.

Required properties of the final opener:

- normalize once;
- validate impossible combinations once;
- generate correlation identity once;
- project the same normalized invocation into CTX;
- derive URL/form transport only when the selected host/data path actually needs transport;
- resolve caller defaults/restrictions through one generic rule composer;
- select the cheapest host adapter without changing entry semantics;
- return one result/lifecycle contract;
- support nested calls without caller knowledge of nesting depth.

`openChildSurface()` remains the lower-level universal UI-level authority. `openEntry()` would be the semantic entry adapter above it, not a replacement for the generic host runtime.

## 10. Optimization plan by risk

| Phase                | Opportunity                                                                                                 | Expected benefit                                                         | Semantic risk        | Required proof                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------- |
| **A1 — implemented** | Introduce canonical normalized entry-opening descriptor/builder; migrate callers without changing transport | removes duplicated assembly and makes later optimization local           | low                  | contract coverage plus existing route/CTX/result regression suite                                               |
| **A2 — implemented** | Centralize token, `_entry*` transport generation, title/presentation defaults and result wiring             | fewer inconsistent parameter paths                                       | low                  | existing popup/recovery/save tests plus canonical transport contract                                            |
| **A3 — implemented** | Make caller-rule composition one generic service (defaults/fixed/restrictions)                              | removes reference-field-specific transport mechanics                     | low-medium           | caller-rule composition contract plus relationship/default regression coverage                                  |
| **B1 — implemented** | Build effective-view resource plan and skip resources not consumed by selected view                         | potentially large reduction for quick/compact openings                   | medium               | full/main/account views unchanged; quick receives every resource it actually consumes                           |
| **B2 — implemented** | Request-scoped deduplicate repeated metadata/reference/capability support reads                             | fewer API calls                                                          | medium               | no authorization or source-record-sensitive result is cached incorrectly                                        |
| **B3 — evaluated**   | Keep canonical metadata request-scoped until an explicit API metadata version/invalidation contract exists  | avoids unsafe stale process state while retaining B2 request dedup       | low                  | process caching deferred until freshness can be proven                                                          |
| **C1**               | Keep fast popup hidden until semantically ready; reveal atomically; spinner only after threshold            | flickerless perceived opening                                            | low                  | accessibility/ready/failure fallback retained                                                                   |
| **C2**               | Pre-size from UI-view/presentation metadata where possible, then correct only if needed                     | less resize movement                                                     | low                  | dynamic tabs/components still re-fit correctly                                                                  |
| **D1**               | Direct-host popup entry without iframe when all required inputs are locally/canonically available           | removes document navigation, HTML parse and cross-window ready handshake | high, highest payoff | exact parity for CTX ownership, defaults, expressions, validation, components, save, recovery and nested popups |
| **D2**               | Reuse the same direct entry-instantiation path for embedded and popup hosts                                 | true single semantic entry runtime                                       | high                 | no second renderer/runtime or host-specific rule path                                                           |

Do **not** begin with D1. Consolidation A makes D1 testable; resource work B may already make compact popups sufficiently fast while preserving the iframe boundary.

## 11. Regression/acceptance matrix for optimization

Before any optimization phase is considered complete, tests should cover at least:

| Contract                     | Cases that must agree                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Create initialization parity | P1 vs O2 for every generic UI entity; O3/O4/O5 only add declared caller constraints                          |
| Existing value parity        | P2 vs O1/O6/O7 for same record; only mutability/presentation may narrow                                      |
| UI-view parity               | same entity/view produces same effective fields/tabs/rules regardless supported host                         |
| Quick semantics              | O9 uses `quick` metadata and compact presentation without quick-specific domain/default logic                |
| Nested invariance            | O8 behaves like its underlying opening at any popup depth                                                    |
| Failed-save preservation     | R1/R2 retain submitted current values and invocation restrictions; no create-default replay over user values |
| Save-and-stay transition     | O10 create→edit preserves applicable invocation/view/density but does not rerun create semantics             |
| Result contract              | O11 returns canonical identity/record/representation once and caller reconciles once                         |
| Cancel/discard               | O12 never commits unsaved ordinary popup state                                                               |
| Recovery                     | O13 reconstructs equivalent invocation then reapplies user changes without duplicate semantic owners         |
| Owner persistence            | O9 never accidentally switches to ordinary CRUD persistence                                                  |
| Embedded parent ownership    | E1/E2 remain local/parent-owned and do not acquire popup/API persistence accidentally                        |
| Authorization                | requested edit cannot override server capability; view remains hard read-only                                |
| Option restrictions          | caller narrowing cannot make an illegal canonical value legal                                                |
| CTX ownership                | exactly one live semantic owner for each entry; no shadow copy introduced for speed                          |

Performance acceptance should be measured separately from semantic correctness. At minimum capture click→ready, click→first-visible-content, UI-server request count, API request count and whether any spinner/busy UI became visible for representative full and quick openings.

## 12. Recommended implementation sequence

1. **Commit this audit as the baseline.** No runtime behavior changes.
2. Instrument representative openings sufficiently to compare request count and click→ready timing during development.
3. Implement A1/A2: one canonical entry-opening descriptor and transport adapter; migrate every matrix caller.
4. Implement A3 and extend regression coverage for caller rules.
5. Implement B1/B2 and measure quick/full openings again.
6. Apply C1/C2 only where measurements show remaining visual churn.
7. Decide from measured results whether D1/D2 is still justified. If yes, make direct hosting a host adapter of the same canonical opener, never a `quick` special case.
8. Replace this audit's current-state sections with/into permanent canonical documentation once implementation settles.

## 13. Source map audited

Primary implementation authorities inspected for this snapshot:

- `ui/src/routes/sysbo/index.ts`
- `ui/src/routes/sysbo/entry/invocation.ts`
- `ui/src/routes/sysbo/entry/renderer.ts`
- `ui/src/routes/sysbo/entry/initialization.ts`
- `ui/src/routes/sysbo/entry/supplemental-data.ts`
- `ui/src/routes/sysbo/entry/write.ts`
- `ui/src/routes/sysbo/entry/owner-managed-entry.ts`
- `ui/src/routes/sysbo/shared/data-access.ts`
- `ui/public/js/runtime/ui-host-runtime.js`
- `ui/public/js/popups/popup-runtime.js`
- `ui/public/js/popups/entry-popup.js`
- `ui/public/js/sysbo/entry/entry-initialization-runtime.js`
- `ui/public/js/sysbo/entry/field-runtime.js`
- `ui/public/js/sysbo/entry/save.js`
- `ui/public/js/sysbo/hierarchy/hierarchy-tree.js`
- `ui/public/js/sysbo/hierarchy/hierarchy-workspace.js`
- `ui/views/components/runtime/entity-entry.ejs`
- `ui/views/components/sysbo/entry/content/related-collections.ejs`
- `ui/views/components/sysbo/entry/content/collection-editor.ejs`
- `shared/src/metadata/ui/view-resolution.ts`
- current architecture documentation under `docs/clients/`, `docs/entities/` and `docs/metadata/`.

## 14. Architectural conclusion

ManatOS already has the correct lower-level foundation: one recursive UI-level host authority and orthogonal host/kind/mode/UI-view concepts. The remaining optimization boundary is **entry invocation itself**.

The safest path to faster, nearly instantaneous compact popups is therefore not to create a fast-popup implementation. It is to make every caller express one canonical entry-opening descriptor, derive transport only when needed, prune resource work from the selected effective view, and then evaluate whether the iframe remains worth its cost. This makes performance optimization a property of one opening pipeline instead of a collection of popup-specific exceptions.

## 15. Post-A+B acceptance/performance measurement contract (implemented 2026-09-16)

### D0 — surface-scoped runtime boundary (implementation started)

Measured routed samples show that popup host mounting is small (roughly tens of milliseconds) while routed hosted-document navigation/initialization remains the dominant structural cost. D1 therefore remains justified, but the failed DOM-import experiment proved that direct hosting cannot precede runtime re-entrancy: the current entry scripts were installed as document-boot singletons.

D0 introduces the generic browser-side entry-surface installer registry. Entry runtimes register installers against a concrete `form[data-v2-entry-form]`; existing forms are installed immediately and future forms are discovered through one shared MutationObserver. The initialization runtime is the first migrated runtime and now owns one instance per form/CTX scope, using the form's canonical `data-ctx-scope-path` rather than assuming that the document's current topology leaf is its owner. A compatibility facade remains while the other entry runtimes are migrated. Direct-host D1 stays disabled until every runtime required by an entry surface is registered/re-entrant.

Before D1/D2 changes the host implementation, the routed popup path now records a development-only measurement at the canonical popup boundary. The measurement is deliberately debugger/runtime bookkeeping, not semantic CTX and not persisted state. It is emitted as `manatos:entry-opening-measured`, and retained only in the current browser runtime through `ManatOS.popup.entry.measurements()`; `clearMeasurements()` resets that transient sample set.

Each completed opening records entity/mode/ui-view/density plus click-to-host-mounted, click-to-iframe-load, click-to-ready and click-to-first-visible-content timings, whether the delayed spinner became visible and when, and the hosted document's Navigation Timing duration/resource count when same-origin timing data is available. The first-visible mark is taken on the animation frame after canonical `manatos:entry-popup-ready` processing removes the preparing veil and iframe `aria-hidden`, so it measures the current atomic reveal boundary rather than an arbitrary DOM milestone.

`apiRequestCount` is measured from the development API-Traffic sequence at opening start/end rather than inferred from browser Resource Timing. The diagnostic sequence read is excluded from the API sequence itself. This gives a practical per-opening delta for isolated development sampling; because the sequence is process-global, unrelated concurrent API traffic can inflate a sample and the value must not be treated as a distributed tracing correlation id.

Acceptance sampling should cover at minimum default/full and quick views for existing records, create/edit where applicable, nested related/reference openings, hierarchy-owned openings, Account's Users view, and at least one view with related collections/references. Compare repeated samples after a fresh UI start and warm runtime. D1/D2 is justified only by measured remaining document-host cost and only if a direct host can preserve the same CTX ownership, initialization/ready boundary, validation, persistence, recovery, nesting and result semantics.

### D0.2 — reactive form/expression runtime re-entrancy (implemented 2026-09-16)

The reactive entry-form runtime is no longer a document-boot singleton bound to whichever entry happened to be the CTX topology leaf. It now registers `reactive-entry-form` with the shared entry-surface installer and binds each installed form to its explicit `data-ctx-scope-path`. Each entry surface owns its own expression evaluator, dependency plan, causal change queue, field projection and disposal listener. Surface disposal removes the global CTX listener and pending queue for that instance rather than leaving a document-lifetime subscriber behind.

A separate host-neutral document evaluator remains available through the existing `ManatOS.expression` / `expressionRuntimeReady` compatibility contract for list/page actions that need expression execution without an entry form. Entry-bound evaluators are exposed through `ManatOS.expressionRuntimes.forForm()` / `forPath()` so the next runtime migrations can consume the correct surface instance without retargeting global mutable evaluator state.

D1 remains disabled. Entry policy, state/save/focus and the remaining entry behaviors still need the same surface-scoped installer treatment (or an explicit audit proving they are already host-neutral) before multiple directly hosted entry surfaces are safe.

### D0.3 — entry-policy runtime re-entrancy (implemented 2026-09-16)

The entry-policy runtime is now installed per concrete entry form through the shared entry-surface registry. Its semantic owner is the form's canonical `data-ctx-scope-path`; it no longer discovers the document leaf or a single document entry form. Tab/action/summary/related-collection policy work is scoped to that form, and disposal remains keyed to the owned UI-level path.

Policy evaluation now waits for the expression runtime belonging to the same form rather than consuming the document-level expression facade. The reactive form runtime exposes a per-form readiness promise for this boundary while retaining the document evaluator only for host-neutral list/page actions. Entry initialization is likewise obtained through `entryInitialization.forForm(form)`.

This removes another document-singleton dependency required for direct popup hosting. D1 remains disabled until the remaining entry behaviors (notably state/save/focus and any component/runtime code found by the next re-entrancy audit) are either migrated to the same per-surface contract or proven host-neutral.

### D0.4a — field-state and focus runtime re-entrancy (implemented 2026-09-16)

The per-field changed-state decorator and initial-focus behavior now install through the shared entry-surface registry rather than selecting one document entry form. Field dirtiness is read from the installed form's explicit `data-ctx-scope-path`; its CTX listener is filtered to that entry's field subtree and is removed when the owning UI level is disposed. Initial focus is likewise form-local and keeps one applied/disposed state per surface, so inserting a direct-host popup cannot retarget or suppress focus on another entry surface.

The remaining D1 blockers found by the same audit are `state.js` and `save.js`, which still select a single document form and own document/window listeners and recovery facades around it. `field-runtime.js`, picture fields and rich text also use document-level delegated event handling, but that is not inherently a single-entry ownership defect: those handlers resolve the event target/root at invocation time. Their global recovery/service facades still require a separate ownership audit before D1 is enabled. D1 remains disabled.

### D0.4b — late-mounted field presentation audit (implemented 2026-09-16)

The generic field presentation runtime now reconciles enhanced enum/reference controls for every newly installed entry surface, not only controls present at document boot. The rich-text runtime likewise exposes idempotent per-surface initialization through the shared entry-surface registry, so a same-document popup inserted after shell startup can initialize its own rich-text roots without a second document boot. Existing delegated field events remain document-level by design because they resolve their concrete field/root from each event target rather than owning one entry.

The audit also narrows the next D1 gate. `state.js` and `save.js` remain true single-edit-entry runtimes, but readonly ui-views do not emit `data-dirty-guard="true"`; therefore those mutation/navigation/recovery runtimes are blockers for future directly hosted editable entries, not for the first readonly D1 slice. Picture-field interaction is delegated/root-resolved and readonly picture presentation is server-rendered; its editable contributor/recovery lifecycle remains part of the later editable-host audit. D1 may be retried only for readonly entry surfaces after the remaining direct-host adapter itself is reintroduced against the canonical surface installer. Create/edit continue on the routed compatibility host until state/save/recovery are migrated.

### D1 — readonly direct popup host retry (implemented 2026-09-16)

Readonly GET entry popups now attempt a same-document direct host before using the routed iframe compatibility host. The canonical `openEntry()` descriptor and transport projection remain unchanged: host selection is an internal popup-host concern, not a new quick-view path or entity-specific behavior.

The direct adapter fetches the ordinary canonical entry route, extracts the server-rendered host-neutral `data-v2-entity-entry` content plus its factual `uiBootstrap` envelope, hydrates the already-open browser-owned popup `ctx.ui.level` through `uiHost.hydrateEntrySurface()`, rewrites the SSR scope path to that actual child path, and installs the form through `entrySurfaces.installForm()`. The popup is revealed only when that form's canonical initialization runtime settles. A direct-host failure falls back to the existing routed iframe without changing caller semantics.

This slice is deliberately limited to `mode: view` + GET. Create/edit/POST remain routed until state/save/recovery become surface-scoped. Measurements now include `hostStrategy: direct|routed`; direct samples report zero hosted-navigation time and resource growth in the owning document during the opening interval, allowing direct and routed samples to be compared without pretending that a second Navigation Timing entry exists.

### D1.1 — readonly reference-resource narrowing (implemented 2026-09-16)

The first direct-host measurements exposed a second cost after iframe removal: readonly quick views still prepared editable reference-selector catalogues. Samples showed 38 API requests for SysUsers, 29 for SysPrincipals, 13 for SysApplications, 21 for SysLicenses and 18 for SysExtAuthProviders even though these views cannot change a reference.

Readonly entry rendering now requests only the persisted target row needed to present each demanded reference field. It does not enumerate the target entity candidate catalogue, apply selection/uniqueness policy, or recursively build selector reference contexts. Editable/create entry surfaces retain the complete candidate and selector preparation path. This is mode-driven resource narrowing, not a quickView special case: any effective readonly entry presentation receives the same behavior.

The next measurement pass should use the same five quick views and compare `apiRequestCount` and click-to-ready against the D1 baseline above. Remaining API calls should then be audited by resource class (canonical metadata/UI metadata, target capabilities, related collections and entity-specific supplemental data) rather than optimized by entity-specific exceptions.
