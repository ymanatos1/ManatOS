# Error Model and Hierarchical Operation Diagnostics

A failed operation has two complementary descriptions: **a safe explanation of what the caller could not complete**, and **a semantic trace of what the system attempted**. The API retains those descriptions independently from HTTP status, JavaScript stack traces and the UIS presentation technology.

The central types are `AppError` and `OperationContext`. Express owns the HTTP failure envelope; the shared UIS owns how the returned user message and optional operation trace are presented. Authentication, authorization, storage and expression errors retain their respective subsystem authority.

## The complete error path

```text
HTTP request
  +-- request-wide OperationContext (AsyncLocalStorage)
       +-- middleware / validation
       +-- API route / application operation
       |    +-- domain authorization
       |    +-- entity/relationship changes
       |    +-- transaction and JSON persistence
       |         +-- temporary-file write
       |         +-- replacement / recovery
       |
       +-- failed semantic branch retained
                  |
                  v
            AppError normalization
                  |
                  v
           HTTP error envelope
         safe text + code + retryability
         [operation trace if configured]
                  |
                  v
        NG1/EJS1 ErrorInfo popup
           text + optional details
```

A JavaScript stack explains functions and call locations. An operation tree explains application intent: for example, *create principal → update contacts → persist datastore → replace JSON file*. This semantic structure is useful for both user support and development diagnosis, but it does not disclose full internal diagnostics in every deployment.

## `AppError`: transport-neutral failure identity

`shared/src/errors/app-error.ts` defines `AppError` with:

- `code`: stable application error code, mapped to an HTTP status by the API transport;
- `message`: developer-oriented error description;
- `userMessage`: intended safe explanation;
- `retryable`: whether the application error allows retry to be considered;
- `cause`: optional underlying error;
- `operationTrace`: optional immutable semantic operation snapshots.

Specialized errors include validation, authentication, authorization, conflict, missing records, storage failure and email delivery failure. Transport-neutral errors do not decide how a browser popup is opened, which HTTP status is returned, or whether a parent Flow should retry. Those decisions belong to the respective boundaries.

## Nested operation ownership and lifecycle

`OperationContext` uses Node `AsyncLocalStorage` to carry independent request IDs and active operation stacks across asynchronous work. The request middleware establishes a **single request-wide root**, including body-parsing and middleware failures; service operations become nested children. A `runRoot()` invoked within that root participates as a child rather than replacing it.

Operations have immutable snapshots containing:

| Field | Meaning |
|---|---|
| `id`, `description` | Identity and developer-oriented operation description |
| `userDescription` | Optional shorter user-oriented description |
| `status` | `running`, `completed`, `failed` or `cancelled` |
| `startedAt`, `completedAt`, `durationMs` | Timing and duration information |
| `comments[]` | Selected diagnostic name/value pairs, with a sensitive flag |
| `children[]` | Nested operation snapshots |
| `errorCode`, `errorMessage` | Failure metadata for the node |

Successful child operations remain as **compact completed nodes**: their own nested children are pruned. Failed branches retain their nested detail and failure information. The request's `AppError` receives the current root snapshot at the transport failure boundary unless a richer trace was already attached.

```text
✗ Create record
  ✓ Validate input                   (nested successful details pruned)
  ✓ Check permissions
  ✗ Persist changes
      ✓ Serialize snapshot
      ✗ Replace datastore file
```

The example illustrates structure; precise descriptions come from the actual executing operations.

`OperationScope.comment(name, value, sensitive?)` and `addContext(values)` attach selected facts. Common secret-bearing names—including password, token, cookie, session, authorization, hash and API keys—are automatically masked to `********` before entering a snapshot. Developers must still avoid placing sensitive data under misleading property names or in untrusted free-form error messages. Masking is a defense, not a general information-flow proof.

## Actual API error envelope

The Express handler in `api/src/http/middleware/error-handler.ts` maps application codes to HTTP statuses and returns this base shape:

```json
{
  "success": false,
  "errorCode": "VALIDATION_ERROR",
  "errorMessage": "A user-safe explanation.",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "A user-safe explanation.",
    "retryable": false
  }
}
```

The root properties are `errorCode` and `errorMessage`—**not** a root `message` property. A successful command may use a root `message`; that success envelope is a different contract.

The same safe message appears as `errorMessage` and `error.message`, allowing simple clients to consume the root and structured clients to retain the complete error object. The handler normalizes non-`AppError` exceptions into an `UNEXPECTED_ERROR` with safe text, and handles oversized request bodies specially. Server-side logs receive method, sanitized path, status, code, retryability, developer message and available operation ID; expected 4xx business/security rejections are warnings, while 5xx failures are logged as errors.

### Controlled detail exposure

`API_ERROR_DETAIL_LEVEL` is configurable and accepts:

| Value | Response behavior |
|---|---|
| `none` | Base safe failure envelope; no operation trace or developer stack |
| `basic` | Same base safe envelope; default configuration |
| `operations` | Includes `error.operationTrace` when available |
| `full` | Includes `error.operationTrace`, `error.developerMessage` and `error.stack` |

`full` exposes internal implementation data and is unsuitable as an ordinary public-production default. The API resolves the configured value through runtime configuration, with the environment/default configuration as fallback. The operation tree exists server-side independently of whether the response exposes it.

The transport's OpenAPI error schema is defined under `api/src/openapi/schemas.ts`; the API handler, not illustrative JSON snippets, is the authoritative serialization contract.

## UIS error presentation and retry ownership

Modern Angular NG1 and EJS1 display application failures using the **shared UIS message/popup structure**. `ErrorPopup` specializes `MessagePopup`; a nested `ErrorInfo` surface receives invocation content, and the message body renders localized static content through the shared page renderer.

- The popup presents user-facing text derived from `userMessage` or `message` and an appropriate caption.
- If `operationTrace` is supplied, the message content offers expandable **formatted JSON**, not an interactive semantic-tree editor.
- The `retryable` flag **does not execute a retry automatically**. A Retry button is offered only when retryability is true **and** the invoking Flow/caller supplies the relevant retry event.
- The owning Flow or operation decides what Retry, Cancel and closing mean. The popup owns presentation and its own nested UI-level lifecycle.
- The browser only displays diagnostics that reached it through the API/host boundary and the popup invocation. Server-side tracing does not imply a trace is always visible in the UI.

The Angular implementation is under `shared.UI.NG/src/components/common/popups/{ErrorPopup,MessagePopupContent}.*`; EJS1 uses the corresponding modules under `shared.UI.EJS/src/components/common/popups/`. The Flow-owned decision pattern is visible in `shared.UI/src/flows/auth/{signinFlow,registerFlow}.ts`.

EJS0 retains a distinct legacy presentation and hosting model. Its historical popup/diagnostic implementation must not be generalized into the modern UIS ownership contract.

## Error information is not authorization

The error envelope is an informational contract. Neither a disabled control nor a successful frontend expression authorizes API work. Authorization is enforced at the API boundary; a forbidden request should still produce a safe error even if client code incorrectly exposes the action.

Expression parsing/evaluation also has typed diagnostics and provenance in `shared/src/expressions/diagnostics.ts`. These diagnostics are related to, but not the same thing as, the Node API's `OperationContext` tree or UI's CTX Viewer. Refer to [Expression Architecture](../expressions/Expression-Architecture.md) and [Diagnostics](../diagnostics/README.md) for those distinct facilities.

## Source and verification contract

- `shared/src/context/operation-context.ts` — request/nested operation lifecycle, pruning, masking and snapshot attachment.
- `shared/src/errors/app-error.ts` — canonical error and operation snapshot types.
- `api/src/http/middleware/error-handler.ts` — HTTP mapping, structured envelope, detail policy and logs.
- `api/src/openapi/schemas.ts` — transport failure schema.
- `shared.UI.NG` and `shared.UI.EJS` message/error popup components — displayed message, trace details and error-specific button policy.
- `shared.UI/src/flows/auth/` — caller-owned error decisions and retry orchestration.

Verification should cover a successful branch beside a deeply failed branch, masking of secrets, unexpected exceptions, every detail level, HTTP status mapping, NG1/EJS1 trace rendering and the case in which no caller-owned retry event exists. Trace visibility must never be confused with authorization to reveal sensitive values.
