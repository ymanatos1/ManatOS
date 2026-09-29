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

| Path                                                              | Meaning                                       | Notes                                                                |
| ----------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| `ctx.user.scope`                                                  | effective application/runtime scope           | authenticated user branch                                            |
| `ctx.user.entityName`                                             | expression-safe entity registry name for User | links to `ctx.entities`                                              |
| `ctx.user.mode.value`                                             | lexical record mode                           | immutable pointer; authenticated user is effectively `view`          |
| `ctx.user.fields.<key>.value`                                     | safe current-user field value                 | field-shaped evaluator contract                                      |
| `.option` / `.options`                                            | selected/available enum/reference decoration  | optional                                                             |
| `.expression`                                                     | authored calculated-field source              | semantic definition only; AST is runtime-private and never CTX state |
| `ctx.user.permissions.userRole`                                   | effective application role                    | safe authorization fact                                              |
| `ctx.user.permissions.platforms.<id>.capabilities.platformAccess` | server-resolved platform entitlement          | presentation fact, not authorization authority                       |

## Recursive UI level

A level's exact payload depends on surface kind, but the common model includes identity/kind, invocation/effective metadata, permissions/facts, state/resources and optional child `level`.

`control.host` is `page`, `popup` or `embedded`. Popup and embedded children share the same recursive UI-level contract; popup opening deactivates the parent, while an embedded child deliberately leaves its parent active.

```text
ctx.ui.level
├── control                    universal on every UI level
│   ├── id / host / kind / mode / name / path / scope
│   ├── entityKey / entityName / recordId   when applicable
│   ├── invocation
│   ├── presentation
│   ├── state
│   ├── facts
│   └── supportsUserChanges
├── fields                     entry surfaces
├── entry                      entry record projections
├── list                       list/hierarchy record projection
│   ├── originalEntries       optional baseline collection
│   └── entries               current projected collection
├── resources                  supporting/component read models when applicable
├── selection / row            selector evaluation state when applicable
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
| `fields.<k>.options[]`          | effective option-domain authority  | metadata plus caller/server restrictions; selectors/policy consume this CTX catalogue             |
| `fields.<k>.ux`                 | effective presentation state       | may be expression-derived                                                                         |
| `entry.current.<k>`             | read-only mirror                   | getter/projection of `fields.<k>.value`                                                           |
| `entry.original.<k>`            | read-only mirror                   | getter/projection of `originalValue`                                                              |
| `control.state.dirty`           | aggregate transaction state        | includes scalar and legitimate compound-editor contributions                                      |

Entry initialization owner sets, remote-work counters and settlement phase are implementation/lifecycle bookkeeping, not semantic CTX. They remain private to the entry-initialization runtime and its lifecycle events; CTX contains the resulting semantic field and aggregate state only.

`control.state.dirty` is an observable aggregate fact, not a container for contributor drafts. Private component contributors expose only aggregate state to the entry runtime; their values remain with their owners. Browser-local Create Organization drafts and outage-recovery packages likewise remain outside semantic CTX. During abnormal outage recovery, temporary baseline alignment used for gentle disposal is recovery bookkeeping and must not be interpreted as persistence.

### List / selector resources

`list.entries` represents the current projected records available to the surface; `list.originalEntries` is the baseline collection when that distinction is semantically meaningful. Calculated fields are projected before publication. Filters/search/paging belong to the owning list/selector. Hosted list/selector surfaces receive a canonical `SurfaceInvocation`: target entity/purpose, optional caller reference, declarative rules and behavior only. Destination fields, callbacks and result routing remain parent-side continuation state rather than child invocation semantics. Selection state belongs to the selector child level; after the child returns a generic selection result, the parent continuation decides what to mutate.

For entry reference fields, `fields.<k>.options[]` is the effective selector domain. `resources.referenceData` remains supporting factual resource data where required by other consumers and must not be used as a fallback catalogue for the same entry field.

### Pointer and collection semantics

A pointer node has `{ kind: 'pointer', value }` and is immutable. Arrays retain numeric indexing and can additionally resolve members by stable `id`/`key`; arbitrary IDs use quoted bracket paths. This is resolver behavior, not duplicated storage.

## API request/subsystem levels

The API process has its own CTX tree. It shares the long-lived `system`, `entities` and `company` semantics but does not expose a root `user` or `ui` branch. Request-owned state lives under `api`:

| Path                              | Meaning                                | Owner / lifecycle                   |
| --------------------------------- | -------------------------------------- | ----------------------------------- |
| `$.api.level-<call-id>`           | one active API request                 | request middleware; removed on exit |
| `.user`                           | authenticated subject for that request | request-owned                       |
| `.control.request.method/path`    | request identity/facts                 | request-owned                       |
| `.level-<subsystem>`              | nested major subsystem operation       | subsystem runtime; removed on exit  |
| nested STORAGE/calculation levels | storage/calculation execution context  | storage runtime; removed on exit    |

Lexical resolution from a nested API level can resolve request-owned `user` and ancestor resources without copying them into each level. Parallel requests and parallel child operations keep separate level identities.

When storage CTX snapshots are enabled, selected request/subsystem subtrees may be serialized immediately before disposal for diagnostics. Those files are not another CTX authority.

## Ownership invariants

1. CTX is observable runtime state, not a persistence database.
2. Child levels never become implicit owners of parent mutations.
3. Mirrors/projections are not second writers.
4. Facts/capabilities are safe observations; protected operations remain server-authorized.
5. Compound workspaces may own aggregate state beyond scalar fields.
6. Closing a level disposes its owned transient state and child topology.
7. Expression definitions in CTX/metadata expose authored source only; AST objects belong to process/browser execution infrastructure and are never semantic CTX children.

See [Client Context Model](Client-Context-Model.md) for narrative mechanics and [State, Mutation and Events](State-Mutation-and-Events.md) for mutation causality.

## Complete surface-variable reference

For the exhaustive V2 page/popup/embedded surface vocabulary, ownership, lifecycle, mutability, initialization semantics, expression resolution and V1→V2 interpretation, see [CTX and Expression Runtime Guide](CTX-and-Expression-Runtime-Guide.md). That guide is normative for deciding whether a new value is semantic CTX or private runtime bookkeeping.
