# Diagnostics and Observability Architecture

## Purpose

ManatOS diagnostics are designed around **correlation and semantic context**, not around isolated console messages. A single API request may pass through authentication, authorization, services, expressions, storage and nested operations. The diagnostic architecture gives those activities one request identity while preserving the semantic nesting of the work.

Diagnostics span both **client-side runtime observability** and **server/API request observability**. The current Express/browser client exposes a rich developer debugger, but those diagnostics represent system capabilities rather than an architectural requirement that every future client use the same dock, DOM or filesystem.

The server-side development toolset combines four complementary views:

1. **API Traffic** — what HTTP call occurred, its request/response, status and timing;
2. **API logs** — structured log records emitted while the call executed;
3. **Operation Context** — semantic application-operation hierarchy and error trace;
4. **API CTX snapshots** — final diagnostic state of request/subsystem CTX levels before disposal.

These facilities intentionally overlap in correlation but not in purpose.

## Client-side observability

A UI-capable client has runtime state that does not exist on the API: active surfaces, field values, dirty/validation state, invocation, component/workspace resources, expression dependencies and presentation decisions. Diagnostics for those concerns belong to the client runtime.

The current web client exposes these through the **CTX Viewer**, targeted CTX views, Properties/Attributes/Subscribers inspection, expression inspection and the shared debugging CLI. These tools observe the same live client CTX used by presentation/expression execution; they do not maintain a second semantic copy of the application state.

A useful client diagnostic model distinguishes:

- **structure** — which surface/level/node owns a value;
- **current semantic value** — what the runtime currently observes;
- **definition/provenance** — metadata/expression/source that produced it;
- **reactivity** — dependencies/subscribers/events that can change it;
- **lifecycle** — when a page/popup/selector/component level is created and disposed;
- **interaction state** — dirty/valid/loading/saving and component/workspace state;
- **transport correlation** — which API request followed a client action.

The CTX Viewer is therefore not an API debugger wearing a UI. It is the client-runtime observer. API Traffic is the bridge from client activity into server diagnostics.

A future Angular, React or mobile client may expose these concepts through different tooling—or no production tooling at all. If it implements ManatOS CTX/UI metadata semantics, its development diagnostics should preserve the same ownership/provenance distinctions rather than exposing framework internals as if they were ManatOS semantic state.

### Client CTX versus API CTX

Client CTX and API CTX are independent. Client CTX models interactive presentation; API CTX models concurrent request/subsystem execution. They may contain similarly named semantic facts obtained from common authoritative sources, but neither tree is synchronized or copied wholesale into the other.

The current CTX Viewer observes live client CTX. Persisted API/storage CTX snapshots shown beside API Traffic are **server artifacts correlated to a request**, not additional live branches of client CTX.

### Operation/error diagnostics in the client

When an API failure carries a sanitized Operation Context trace, a client may present concise user-facing failure text and separately expose diagnostic details to developer tooling. The current web client provides an Operation failed modal with CTX/developer inspection affordances. Another client may render the same distinction differently.

The presentation must not turn developer diagnostics into authorization or business state.

## One request identity

Every participating client/BFF-to-API request receives a correlation/request ID before transport. The current Express UI server creates and sends it through `x-request-id`; another client topology may originate it elsewhere. The API accepts and reuses the supplied value rather than inventing a second identity.

That same ID is used for:

- the API Traffic row;
- structured API log records;
- the root API CTX call ID;
- post-request CTX snapshot directory naming;
- storage CTX diagnostic grouping beneath the request.

Conceptually:

```text
originating client/BFF creates request id R
          |
          +--> API Traffic entry R
          |
          +-- x-request-id: R --> API request
                                  |
                                  +--> operation/log records requestId=R
                                  +--> $.api.level-R
                                  +--> debug/<R>/api.json
                                  +--> debug/<R>/storage/.../ctx.json
```

A second independently generated ID at any of these boundaries would break post-mortem correlation and should be treated as an architectural regression.

## API Traffic

The current web-client developer debugger records API calls made through its UI server/BFF. The entry is a sanitized diagnostic projection, not a raw duplication of all transport state.

A traffic entry includes the request identity and useful transport facts such as:

- method and path;
- start time and duration;
- HTTP status and success/failure state;
- sanitized request body where present;
- sanitized response body where present;
- transport error when no response exists.

API Traffic is primarily a **transport timeline**. It answers “what did the UI ask the API to do?” and “what came back?” It is not the authoritative business-operation trace.

The current client debugger can pause/clear/filter the traffic view without changing API behavior.

## Structured API logging

The API logger includes the current request ID from request/operation context on log records emitted during that request. Individual business code should not repeatedly thread `requestId` through every logger call merely for correlation.

A typical structured log record contains fields such as:

```json
{
  "timestamp": "...",
  "level": "info",
  "requestId": "...",
  "message": "HTTP request completed",
  "method": "GET",
  "path": "/api/v1/...",
  "statusCode": 200,
  "durationMs": 12.4
}
```

The exact record schema may grow, but the request identity remains the stable join key.

In the current co-located development deployment, the API Traffic debugger can read the existing API log files from the shared filesystem and show only records matching the selected request ID. This deliberately simple implementation is a local-development convenience, not a requirement that UI and API servers always share a filesystem.

For split-server/production deployments, a future diagnostic transport may replace direct filesystem access without changing the correlation model.

## Operation Context

Operation Context captures **semantic work**, not merely transport. One HTTP request can contain a hierarchy of named application operations.

An operation snapshot records:

- operation ID;
- developer and optional user-oriented descriptions;
- running/completed/failed/cancelled state;
- timing;
- diagnostic comments/values;
- children;
- error code/message where applicable.

This hierarchy explains _what the application was doing_ when a failure occurred. For example, a request may contain a child operation that applies authorization policy, another that executes a business rule and another that persists a transaction.

Error responses can include a sanitized operation trace. The UI error modal may expose that trace to developer tooling while keeping end-user messaging concise.

Operation Context should not become a dumping ground for arbitrary runtime state. CTX and logs serve different diagnostic needs.

## API CTX

The API has one process-local CTX tree with stable global branches and parallel request branches.

At a high level:

```text
$
├── company
├── system
├── entities
└── api
    ├── level-<request-A>
    │   ├── user
    │   └── nested levels...
    └── level-<request-B>
        ├── user
        └── nested levels...
```

Each HTTP request receives its own branch. Nested subsystem operations create child levels under the request. Lexical/ancestor lookup lets nested code observe request-owned facts without copying them into every child.

Async-local execution state points code at the correct request/level without creating a global mutable “current request” variable that would be unsafe under concurrency.

API CTX is independent from client/UI CTX. They share structural concepts and semantics where appropriate but are not synchronized or serialized between processes.

See [Context Architecture](../context/Context-Architecture.md) for the full CTX model.

## Storage diagnostic levels

Storage operations executed inside an API request use `runStorageOperation()` to create a nested level marked with diagnostic group `storage`.

The level exposes storage resources such as:

- adapter ID;
- adapter family ID;
- effective capabilities;
- resolved behavior strategies.

Nested storage calculations or other subsystem levels can sit below that storage root.

This makes a storage snapshot more useful than a plain “repository method called” log line: it captures the contextual storage strategy/facts relevant to that operation.

There is currently no independent “storage.log” infrastructure. Storage diagnostics are represented by the normal correlated API log plus storage CTX snapshots. If dedicated storage log events are later useful, they should keep the same request ID and subsystem context rather than inventing a parallel logging system.

## CTX snapshots

Request CTX is intentionally ephemeral. To support post-request debugging, an optional snapshot writer captures sanitized CTX immediately before request/diagnostic levels are disposed.

When enabled, the layout is conceptually:

```text
<debug-root>/
  <request-id>/
    api.json
    storage/
      <storage-level-id>/
        ctx.json
        levels/
          <nested-level-id>/
            ctx.json
```

The request directory is keyed by the same ID shown in API Traffic and API logs.

Each snapshot carries metadata describing:

- call/request ID;
- call/level path;
- capture time;
- reason (`request-dispose` or `level-dispose`);
- subsystem/group where relevant;
- level identity/path information.

The `ctx` property contains the sanitized captured subtree.

## Snapshot safety

Diagnostics must not turn secret-bearing runtime state into a second unsecured datastore.

Snapshot sanitization therefore handles:

- password/secret/token names;
- authorization/cookie material;
- API/client/private keys;
- credentials/connection strings;
- access/refresh tokens and session identifiers;
- buffers and non-JSON-native values;
- circular structures.

The sanitization boundary is centralized. Individual callers should not rely on remembering to remove secrets before asking for a snapshot.

Snapshot writing is **non-fatal**. Failure to create a diagnostic artifact may be logged, but it must not fail an otherwise successful business request.

## Debug output directory

The API storage CTX debugging setting defines the diagnostic snapshot output directory. Relative paths are resolved by the API process.

The setting belongs to System Settings because it controls API diagnostic persistence. It should not be confused with business storage selection.

For the current co-located Express-client developer setup, the UI debugger uses the configured directory as an anchor to discover the request snapshot tree and nearby API log files. If UI and API processes are deployed on hosts that do not share those files, these local diagnostic tabs are unavailable until a remote diagnostic transport is introduced.

That deployment limitation is intentional and visible; client-side code should never attempt direct arbitrary server-filesystem access.

## API Traffic detail tabs

The API Traffic properties panel is an aggregation point for diagnostics correlated to the selected request.

Current/future views can include:

```text
Request | Response | <API log file(s)> | Storage CTX <level(s)> | ...
```

A log tab contains only lines whose structured request ID matches the selected traffic row. If multiple eligible log/rotated-log files contain matching entries, each can be shown independently.

Storage CTX tabs are discovered from the selected request's snapshot directory. They appear only when that request actually entered storage and corresponding snapshots exist.

The debugger should prefer “no diagnostic artifact available” over manufacturing synthetic content.

## Development versus production

The architectural correlation model is environment-independent, but diagnostic surfaces may differ by deployment.

Development can reasonably provide:

- detailed request/response inspection;
- filesystem-backed log correlation;
- CTX snapshots;
- developer operation traces;
- rich debugger panes.

Production must apply stricter retention, access-control, privacy and performance policies. The existence of a developer diagnostic feature is not itself permission to expose it publicly.

## Diagnostic ownership rules

1. The API request ID is the cross-tool correlation key.
2. Transport traffic belongs to API Traffic; semantic operations belong to Operation Context.
3. Runtime contextual state belongs to CTX, not to ad-hoc logger payloads.
4. Storage diagnostics use nested storage CTX and the normal logger before creating a second logging framework.
5. Sensitive data must be sanitized centrally before persistence/presentation.
6. Diagnostic failure must not alter business success/failure semantics.
7. Current-client filesystem diagnostic access remains in its trusted server/BFF side and optional; untrusted client code must not read arbitrary server paths directly.
8. Split deployment and alternative clients should degrade gracefully rather than assuming the current monorepo/co-located filesystem topology.
9. Client-runtime diagnostics and API-runtime diagnostics remain separate semantic observations joined by explicit correlation, not by shared mutable state.

## Audience-specific follow-up

- **Developers:** [Developer Tools](Developer-Tools.md) and [Testing](../development/Testing.md).
- **CTX/runtime implementers:** [Context Architecture](../context/Context-Architecture.md) and [CTX and Expression Runtime Guide](../context/CTX-and-Expression-Runtime-Guide.md).
- **API implementers:** [API Architecture](../api/API-Architecture.md).
- **Storage implementers:** [Data and Storage Architecture](../storage/Data-and-Storage-Architecture.md).
- **Client implementers:** [Client Implementation Guide](../clients/Client-Implementations.md).
- **Administrators/developer users:** [Developer Tools usage](Using-Developer-Tools.md).
