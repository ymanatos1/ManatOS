# CTX Catalog

This catalog describes the public runtime context vocabulary. Exact child nodes vary by surface kind and loaded metadata, but ownership rules are stable.

## Root

| Path                               | Meaning                               | Owner / lifecycle                        | Mutation                    |
| ---------------------------------- | ------------------------------------- | ---------------------------------------- | --------------------------- |
| `ctx.system`                       | runtime/host facts                    | root bootstrap; session/runtime lifetime | host/runtime owned          |
| `ctx.system.scope`                 | active root application/runtime scope | root                                     | read-only fact to consumers |
| `ctx.system.runtime.mode`          | safe runtime mode                     | bootstrap                                | read-only                   |
| `ctx.system.runtime.developerMode` | declarative developer-mode fact       | bootstrap/config                         | read-only                   |
| `ctx.system.server.apiBaseUrl`     | API endpoint fact                     | bootstrap                                | read-only                   |
| `ctx.system.client.kind`           | client kind                           | UI bootstrap                             | read-only                   |
| `ctx.system.client.version`        | client version                        | UI bootstrap                             | read-only                   |
| `ctx.system.client.features.*`     | safe client feature facts             | UI bootstrap                             | read-only                   |
| `ctx.entities.<name>`              | canonical entity knowledge            | root registry/metadata loading           | registry owned              |
| `ctx.entities.<name>.key`          | canonical metadata key                | entity registry                          | read-only                   |
| `.metadata` / `.uiMetadata`        | loaded canonical/UI metadata          | metadata loading                         | registry owned              |
| `ctx.company`                      | company/platform catalog              | root bootstrap                           | read-only to UI policy      |
| `ctx.company.sysBO`                | company-wide entity contributions     | company catalog                          | read-only                   |
| `ctx.company.platforms[]`          | platform contexts                     | company catalog                          | read-only                   |
| `ctx.company.currentPlatform`      | active platform ID                    | platform/navigation runtime              | controlled runtime mutation |
| `ctx.company.currentPlatformIndex` | active platform index                 | derived/navigation state                 | controlled runtime mutation |
| `ctx.user`                         | authenticated-user context or `null`  | login/session snapshot                   | session owned               |
| `ctx.ui.level`                     | first active UI level                 | UI host/runtime                          | surface runtime owned       |

## User

| Path                                                              | Meaning                                              | Notes                                                       |
| ----------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| `ctx.user.scope`                                                  | effective application/runtime scope                  | authenticated user branch                                   |
| `ctx.user.entityName`                                             | expression-safe entity registry name for User        | links to `ctx.entities`                                     |
| `ctx.user.mode.value`                                             | lexical record mode                                  | immutable pointer; authenticated user is effectively `view` |
| `ctx.user.fields.<key>.value`                                     | safe current-user field value                        | field-shaped evaluator contract                             |
| `.option` / `.options`                                            | selected/available enum/reference decoration         | optional                                                    |
| `.expression` / `.ast`                                            | calculated-field source/compiled AST when applicable | declaration/runtime-local compilation semantics             |
| `ctx.user.permissions.userRole`                                   | effective application role                           | safe authorization fact                                     |
| `ctx.user.permissions.platforms.<id>.capabilities.platformAccess` | server-resolved platform entitlement                 | presentation fact, not authorization authority              |

## Recursive UI level

A level's exact payload depends on surface kind, but the common model includes identity/kind, invocation/effective metadata, permissions/facts, state/resources and optional child `level`.

```text
ctx.ui.level
├── name / kind / mode / entity identity (as applicable)
├── fields                     entry surfaces
├── entry                      entry record projections
├── dataList / entries         list/resource surfaces
├── filters / search / paging  list/selector surfaces
├── permissions / facts
├── state
├── callingParams / presentation (invoked child surfaces)
└── level                      optional child surface
```

### Entry fields

| Path                            | Authority                          | Lifecycle/event behavior                                                                          |
| ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `fields.<k>.value`              | sole live scalar authority         | changed through canonical field mutation; publishes semantic change                               |
| `fields.<k>.originalValue`      | sole scalar baseline authority     | initialized from source/default baseline; updated after successful persistence/baseline operation |
| `fields.<k>.dirty`              | derived                            | live vs baseline; not an independent writer                                                       |
| `fields.<k>.valid`              | validation-derived                 | contributes to aggregate validity                                                                 |
| `fields.<k>.validationIssues[]` | validation output                  | owned by field/validation runtime                                                                 |
| `fields.<k>.option`             | selected enum/reference decoration | follows effective value/options                                                                   |
| `fields.<k>.options[]`          | available choices                  | metadata/runtime resource                                                                         |
| `fields.<k>.ux`                 | effective presentation state       | may be expression-derived                                                                         |
| `entry.current.<k>`             | read-only mirror                   | getter/projection of `fields.<k>.value`                                                           |
| `entry.original.<k>`            | read-only mirror                   | getter/projection of `originalValue`                                                              |
| `state.dirty`                   | aggregate transaction state        | includes scalar and legitimate compound-editor contributions                                      |

### List / selector resources

`dataList`/`entries` represent projected records available to the surface. Calculated fields are projected before publication. Filters/search/paging belong to the owning list/selector. Selector `callingParams` can describe purpose, target/source identity, selection mode, relation/anchor, query predicate and presentation options. Selection state belongs to the selector child level; committing selection mutates the anchored owning entry field.

### Pointer and collection semantics

A pointer node has `{ kind: 'pointer', value }` and is immutable. Arrays retain numeric indexing and can additionally resolve members by stable `id`/`key`; arbitrary IDs use quoted bracket paths. This is resolver behavior, not duplicated storage.

## Ownership invariants

1. CTX is observable runtime state, not a persistence database.
2. Child levels never become implicit owners of parent mutations.
3. Mirrors/projections are not second writers.
4. Facts/capabilities are safe observations; protected operations remain server-authorized.
5. Compound workspaces may own aggregate state beyond scalar fields.
6. Closing a level disposes its owned transient state and child topology.

See [Context Model](../design/Context-Model.md) for narrative mechanics and [State, Mutation and Events](../design/State-Mutation-and-Events.md) for mutation causality.
