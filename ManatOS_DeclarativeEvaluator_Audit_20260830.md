# ManatOS declarative/evaluator simplification audit

Snapshot reviewed: 2026-08-30 uploads of `ui`, `api`, `shared`, and `documentation`, including Postman.

## Scope and explicit exclusion

This review covers the current source, metadata contracts, runtime CTX/evaluator, API authorization, current metadata-driven renderer, Account/Playground/custom pages, Postman, and documentation.

Per request, it **does not count the temporary #16 Current-EJS entity list/edit implementations as refactoring targets**. Those are comparison/reference code and should be deleted after their metadata-driven counterparts are accepted. The excluded legacy EJS/definition area is already substantial (roughly 1,151 source lines across the obvious list/edit/provider partials and legacy SysBO UI definition registry), so the savings below are *in addition* to that eventual deletion.


## Completion note — 2026-09-02

The Phase-B recommendations from this audit have now been implemented and verified. In particular:

- `ctx.user.permissions.<platform>.capabilities.platformAccess` is populated as the single trusted UI platform-access fact; the duplicate `app.currentPlatformEntitled` path has been removed.
- navigation and metadata-driven standard actions consume evaluator-backed dynamic values against request/page CTX; API/domain authorization remains independently authoritative.
- the metadata-driven entry renderer has been decomposed into reusable tab/content/action components, with EJS runtime-composition regression coverage.
- Debugging inventory construction has moved from EJS into a reusable TypeScript presentation-model builder, preserving formula/current-value CTX inspection as separate capabilities.
- generic option/value presentation has moved into a shared resolver; the renderer-specific `verification-source` concept has been removed in favor of metadata-declared option presentation.
- mCRM-specific Playground styling is isolated in the platform stylesheet rather than duplicated in generic CSS.

The historical findings below are intentionally retained as the record of the 2026-08-30 audit; statements describing then-current duplication should therefore be read as snapshot findings, not current architecture.

## Executive result

The evaluator is already mature enough to remove a meaningful amount of UI decision code **without extending expression syntax**. The largest immediate opportunity is not adding more expressions indiscriminately; it is making resolved permission/capability facts first-class in CTX and letting metadata consume them consistently.

A conservative estimate is:

- **~180–300 LOC** of current non-legacy UI decision/presentation code can be removed or centralized with capabilities the evaluator already has.
- **~70–130 LOC** more can be simplified after small framework-neutral metadata additions (`enabled`, dynamic list action visibility, generic option presentation, etc.).
- **~80–150 LOC** of authorization branching can eventually become declarative *only after* trusted server-side permission facts are resolved first. Datastore/relationship lookups should not be moved into browser expressions.
- Additional non-evaluator cleanup (especially unreachable Playground states and duplicated Account/debug formatting) can remove another **~80–150 LOC**.

These are directional, deliberately conservative figures; they exclude the disposable #16 Current-EJS forms.

## 1. CTX should become the single decision-fact surface

Current good direction:

```text
ctx
  system
    server
    client
  entities
  company
  user
    fields
    permissions
  page
```

`ctx.user.permissions` is the key architectural leverage point. Today it contains `userRole` and a platform `capabilities` placeholder. The next useful step is to populate that capability bucket with *resolved facts*, for example:

```text
ctx.user.permissions.mcrm.capabilities.platformAccess = true
ctx.user.permissions.mcrm.capabilities.appsPlayground = true
ctx.user.permissions.mcrm.capabilities.applicationsRead = true
```

and, on an entry page, expose effective record facts such as:

```text
permissions.view
permissions.create
permissions.edit
permissions.delete
permissions.isOwnRecord
```

Then metadata expressions can make presentation decisions without repeating role/license logic.

### Current duplication to remove

`ui/src/middleware/page-context.ts` resolves `currentPlatformEntitled`, then duplicates that fact into `app.currentPlatformEntitled` and also passes it separately into `navigationFor(...)`. The CTX permission branch is currently left empty. This should converge on one fact source.

**Recommendation:** resolve entitlement once, store it in trusted server-built CTX permissions, and make UI navigation/metadata read the same fact. Keep the API authorization service authoritative.

## 2. Navigation is the strongest immediate declarative candidate

Current navigation metadata has three separate decision mechanisms:

- `requiresAuthentication`
- `roles`
- `requiresPlatformEntitlement`

`navigationFor()` then imperatively interprets them.

A cleaner framework-neutral model is one dynamic property:

```ts
visible?: boolean | { expression: string }
```

Examples:

```text
user !== null
user.permissions.userRole === 'Admin'
user.permissions.mcrm.capabilities.platformAccess === true
```

`requiresEntityKeys` should remain structural composition metadata; it is not primarily an authorization decision.

### Benefit

- one decision mechanism across tabs, fields, actions, and navigation;
- removes repeated role arrays from `shared/src/company-platform.ts`;
- reduces branching in `ui/src/navigation.ts`;
- prevents future horizontal/vertical rule drift;
- makes role/license changes visible in the Debugging/CTX tooling.

Estimated net reduction: **~40–70 LOC**, with larger maintainability benefit than raw line count.

## 3. Account page can reuse SysUser metadata instead of duplicating decisions

`ui/views/pages/account.ejs` plus `ui/views/partials/authentication-summary.ejs` currently duplicate several facts already represented by canonical/UI metadata:

- full name calculation;
- email-verification label/status/tone;
- local-password label/status/icon/tone;
- provider email-verification presentation;
- System-details formatting;
- developer Debugging row discovery/value formatting.

The new Account Debugging tab made the duplication especially visible.

### Recommended direction

Use the same metadata-driven record presentation engine in a read-only **Account projection/mode**, or extract generic metadata-driven summary/debug partials used by both the SysUser entry renderer and Account.

Account-specific metadata can decide which actions are available (for example password action) without re-implementing the calculations.

Estimated reduction: **~120–200 LOC** across Account/authentication/debug presentation, while also eliminating formula drift.

## 4. Metadata-driven entry actions need `enabled` (and optional reason/title)

The current SysUser delete UI still contains renderer logic around:

- own-user detection;
- delete authorization;
- disabled state;
- tooltip/reason.

This is a natural metadata decision:

```ts
enabled?: SysBOUIDynamicValue<boolean>
disabledReason?: SysBOUIDynamicValue<string>
```

with page permission facts exposed in CTX.

Example:

```text
permissions.delete === true && permissions.isOwnRecord !== true
```

The API remains authoritative; the expression only controls presentation.

Estimated reduction: **~20–35 LOC** and removes the remaining SysUser-specific delete presentation branch from the generic metadata renderer.

## 5. List actions should use the same dynamic-value contract

`SysBOUIAddActionMetadata.visible` is currently static `boolean`, unlike record actions and many other UI properties.

Change it to a dynamic value and optionally add `enabled`/`disabledReason`.

This can replace combined template logic such as:

```text
permissions.create && metadataUI.list.addAction.visible
```

with a resolved declarative action state.

The External Authentication Providers list currently has a hard-coded `allExternalProvidersConfigured` disable rule. That is exactly the type of page fact that should be put in CTX and consumed by metadata rather than checked with `definition.key === 'sys-ext-auth-providers'` in the generic renderer.

Estimated reduction: **~15–30 LOC**.

## 6. Generic option/enum presentation can remove entity-key branches

The metadata-driven entry/list renderer still special-cases External Auth Provider presentation to map provider keys to labels/icons.

Rather than:

```text
definition.key === 'sys-ext-auth-providers' && key === 'provider'
```

add a generic field/option presentation contract (formatter or option source). This is not primarily evaluator work, but it removes entity-specific renderer knowledge and makes the metadata engine more genuinely generic.

Estimated reduction: **~10–20 LOC** plus better extensibility.

## 7. App Playground contains unreachable presentation branches

The `/app-playground` route currently requires:

1. signed-in user; and
2. current platform entitlement.

But `app-playground.ejs` still contains branches for:

- anonymous user;
- unverified Guest;
- Guest with no license.

Those states cannot reach the page through the current route. They are dead presentation branches under the current security contract.

This is an immediate cleanup candidate independent of the evaluator. If those states should be shown, the route contract should be changed deliberately; otherwise remove them.

Estimated reduction: **~35–50 LOC**.

## 8. UI permission role arrays are transitional and can drift from API authorization

`uiPermissions()` currently interprets legacy `SysBODefinition.permissions` role arrays and adds an own-SysUser exception. The API has richer record-level/license-level authorization.

For metadata-driven pages, this creates two sources of truth.

### Recommended direction

Have the trusted server/API expose effective operation facts for the current subject/record, then project those facts into CTX/page context. UI metadata consumes them via expressions.

This would eventually remove much of:

- `uiPermissions()`;
- record-specific UI permission exceptions;
- repeated route-side permission booleans;
- renderer checks such as `permissions.delete`.

Do **not** replace API authorization by trusting browser CTX. The API should compute/enforce the authoritative decision and the UI should consume a safe projection of that result.

Estimated non-legacy UI reduction: **~40–70 LOC** after #16 migration scaffolding is gone.

## 9. API authorization can become declarative only after fact resolution

`api/src/auth/authorization-service.ts` is not ready to be replaced directly by expression strings because several decisions require datastore-backed relationship/license facts.

The safe architecture is two-stage:

```text
trusted server fact resolution
  -> isAdmin
  -> isOwnUser
  -> relatesToPrincipal
  -> relatesToLicense
  -> platformEntitled
  -> applicationEntitled

then

authorization policy expression
```

For example:

```text
isAdmin || (action === 'read' && isOwnUser)
```

The evaluator should not be given direct datastore query responsibilities. If authorization metadata is introduced, evaluate it server-side against a trusted authorization CTX/fact object.

Potential later reduction: **~80–150 LOC** of branching/policy duplication, but this should be a separate security-focused change with strong tests.

## 10. Business state transitions should remain domain logic

Not every `if` should become an expression.

Examples that should remain imperative/domain-owned unless ManatOS deliberately introduces a workflow/rules engine:

- Guest -> User promotion when linking a principal;
- password/credential lifecycle transitions;
- external identity linking invariants;
- encryption and secret-state transitions;
- relationship cascade execution;
- persistence transactions/rollback;
- HTTP/session mechanics.

The evaluator is best used for **decisions over already-resolved facts**, not for side effects.

## 11. Metadata contract opportunities

The current `SysBOUIDynamicValue<T>` is useful but UI-specific in name. Because navigation and eventually trusted authorization policy can use the same concept, promote the primitive to a generic shared contract, for example:

```ts
export type ManatOSDynamicValue<T> = T | Readonly<{ expression: string }>;
```

Then alias/use it from:

- SysBO UI metadata;
- navigation metadata;
- future workflow/policy metadata;
- future dynamic canonical constraints if needed.

Possible small extensions:

- list action `visible` -> dynamic;
- list/entry action `enabled` -> dynamic;
- optional `disabledReason` -> dynamic string;
- optional action label/title -> dynamic only if a real use case appears;
- dynamic canonical `required/readOnly` should be introduced only if the *domain rule* itself is dynamic, not merely to avoid EJS code.

## 12. Renderer size and decomposition

The metadata-driven entry EJS is currently ~1,125 lines. Not all of this is decision logic; much is rendering and debugging infrastructure. Still, after declarative decision cleanup it should be decomposed into generic partials/helpers by responsibility:

- tab shell;
- field renderer;
- summary renderer;
- related collection renderer;
- action renderer;
- Debugging table renderer.

This is primarily maintainability/refactoring rather than evaluator work, but it will make it much easier to verify that entity-specific logic has not leaked into the engine.

## 13. Postman review

The supplied Postman collection parses successfully and currently contains **71 requests**. The environment/collection variables are internally consistent:

- 16 variables are referenced;
- no referenced variables are missing from collection/environment scope;
- no duplicate request paths/names were found in the collection traversal.

The collection already covers canonical metadata, UI metadata, delete-impact, authentication, configuration, external-authentication credential lifecycle, and current SysBO endpoints.

### Recommendation

Do **not** make Postman assert renderer-specific formulas aggressively. Postman should verify API metadata shape/access/security, while Vitest should verify particular evaluator-driven UI expressions. A small generic `$metadata-ui` contract assertion is reasonable; entity-specific visual-decision assertions belong in automated code tests.

No endpoint-level Postman change is required by the CTX `system` ordering change.

## 14. Documentation review

The documentation is broadly aligned with the current architecture, but the reviewed snapshot had several stale statements:

1. UI docs described `navigationFor(role, auth)` although platform entitlement is now a separate access input.
2. UI docs said all debugger state resets on server restart; the explicit debugger open/closed preference now survives restart while transient selection/history remains boot-scoped.
3. #16 docs implied every participating SysBO still has a Current-EJS/Metadata selector; SysUsers is already locked to Metadata-driven.
4. Architecture did not yet describe the new `ctx.system` / `ctx.user.permissions` shape clearly.

The accompanying patch updates these points.

## 15. Recommended implementation order

### Phase A — low risk, current evaluator is sufficient

1. Populate `ctx.user.permissions.<platform>.capabilities` with real resolved entitlement facts.
2. Promote generic `ManatOSDynamicValue<T>`.
3. Add evaluator-backed navigation `visible` and migrate role/auth/platform visibility rules.
4. Add `enabled`/`disabledReason` to metadata actions and remove own-SysUser/delete renderer branches.
5. Make list `addAction.visible/enabled` dynamic and remove the ExtAuth provider list special case.
6. Reuse metadata-driven summary/debug components on Account.
7. Remove unreachable Apps Playground branches.

### Phase B — generic renderer cleanup

8. Add generic option/enum presentation sources/formatters to eliminate provider-specific renderer branches.
9. Split the 1,125-line metadata-driven entry template into generic partials/helpers.
10. Remove duplicate `app.*` facts once CTX is the single presentation-decision context.

### Phase C — security-focused declarative policy

11. Define trusted authorization fact context.
12. Introduce server-side authorization policy expressions only over resolved facts.
13. Keep datastore queries, side effects and security enforcement outside browser evaluation.

## Bottom line

The evaluator can already simplify ManatOS significantly, but the highest-value move is **fact centralization**, not more syntax. Once permission/license/session facts are projected into CTX, navigation, metadata-driven actions, Account presentation and other UI decisions can all use the same expression engine. That gives ManatOS one inspectable decision model, reduces EJS/TypeScript branching, and makes the Debugging/CTX tools genuinely useful as a system-wide decision debugger.
