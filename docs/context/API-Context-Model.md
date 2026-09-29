# API Context Model

## Purpose

This document describes the **API/server realization** of the generic [CTX architecture](Context-Architecture.md). The API owns one process-local CTX tree. It is independent from every client CTX tree: clients do not upload their CTX to the server and the API does not synchronize its tree back to clients.

API CTX makes concurrent request execution and nested subsystem activity observable through the same semantic context principles used elsewhere in ManatOS. It gives expressions, diagnostics and server infrastructure a structured address space without introducing global mutable "current request" state.

## Process topology

The API process owns long-lived roots plus a branch for active API executions:

```text
$
├── company
├── system
├── entities
└── api
    ├── level-<request-id-A>
    │   ├── user
    │   └── level-<nested-operation>
    │       └── ...
    └── level-<request-id-B>
        ├── user
        └── ...
```

`company`, `system` and `entities` are process-level semantic roots. `api` is the execution area. Each request receives a unique root level; concurrent requests are siblings and never overwrite one another.

There is deliberately **no API-side root `$.user`**. User/subject projection belongs to the request that authenticated it, so it lives beneath the corresponding request level. This prevents one request's subject from becoming process-global state.

## Request-level ownership

When a request enters the API, the operation-context middleware establishes the request/correlation identity and creates its API CTX branch. The branch can contain:

- request identity and safe operation facts;
- the authenticated user/subject projection for that request;
- nested operation levels created by major subsystems;
- diagnostic metadata required to correlate work with logs/snapshots.

The branch is the semantic owner for request-local state. `AsyncLocalStorage` carries only the pointer/identity needed to locate the current operation context; it is not a second CTX and does not hold a parallel mutable copy of request state.

## Nested subsystem levels

Major server activities can create child levels beneath their request owner. Storage is an important example:

```text
$.api.level-R42
├── user
└── level-storage-1
    ├── control / facts
    └── level-calculation-1
        └── ...
```

The exact semantic data in a level belongs to the subsystem that created it. Descendants resolve request-owned ancestors lexically, so a deep storage/calculation operation can access appropriate request context without copying `user` or other ancestor data into every nested level.

Parallel nested work must use independent level identities. There is no process-global mutable "current API level".

## Lookup semantics

The generic CTX lookup model applies on the API exactly as it does in other hosts: local values are resolved first, then appropriate ancestors/root contracts. This enables nested operations to consume request facts while preserving ownership.

The important architectural rule is **resolution without duplication**. A nested subsystem should not mirror an ancestor's mutable semantic value merely to make it convenient to access.

## Expressions and capabilities

API-hosted expression evaluation uses the process-local expression registry and AST cache. Pure/clock/CTX-backed functions can execute when their required inputs are present. Resolver-backed functions such as `TraverseEntity(...)` execute where the API can inject the authoritative `EntityResolver`.

Expression source remains the portable metadata contract; AST objects are never transferred from a client or another process.

## Concurrency

Two simultaneous requests can safely have different authenticated users, entity operations and storage work:

```text
$.api
├── level-R1
│   └── user = Alice
└── level-R2
    └── user = Bob
```

No caller should determine the current subject by inspecting a shared "last request" property. Request ownership is carried by the operation context and its CTX branch.

## Lifecycle and cleanup

A request branch is created for request execution and disposed deterministically when that execution is complete. Nested levels have correspondingly bounded lifecycles.

When API/Storage CTX snapshot diagnostics are enabled, the diagnostic writer captures the relevant subtree **before disposal**. File I/O can then complete asynchronously without extending semantic CTX ownership merely to keep a diagnostic file write alive.

## API and Storage CTX snapshots

Diagnostics can persist:

```text
data/logs/api/<request-id>/api.json
data/logs/api/<request-id>/storage/<storage-level-id>/ctx.json
data/logs/api/<request-id>/storage/<storage-level-id>/levels/<nested-level-id>/ctx.json
```

The root API snapshot represents the request execution tree. Storage snapshots expose the storage-owned subtree and descendants. Snapshot serialization applies central redaction/summarization rules so diagnostics do not become an accidental secret channel.

See [Diagnostics and Observability](../diagnostics/Diagnostics-and-Observability-Architecture.md) for the complete correlation path.

## API CTX versus Client CTX

| Concern                           | API CTX                            | Client CTX                                      |
| --------------------------------- | ---------------------------------- | ----------------------------------------------- |
| Owner                             | API process                        | Interactive client                              |
| Concurrency shape                 | sibling request levels             | active recursive UI-level chain                 |
| User projection                   | beneath each request level         | client root/session projection                  |
| Main transient scope              | request + nested server operations | page/popup/embedded surface + fields/components |
| Authoritative server capabilities | available/projected here           | consumed as safe facts                          |
| Storage nested levels             | yes                                | no                                              |
| UI fields/components              | no                                 | yes                                             |
| Synchronization between trees     | none                               | none                                            |

They share CTX semantics, not state identity. A client request can lead to an API CTX branch, but that branch is built from authoritative server/request facts rather than copied from the caller's CTX.

## Example: one save request

A client entry save sends an HTTP request with correlation id `R42`. The API creates `$.api.level-R42`, attaches the authenticated request user, performs authorization and service work, then enters storage beneath that branch. A persisted calculation may create/evaluate nested work and use `TraverseEntity(...)` through the API-injected resolver. Diagnostics can correlate the client's API Traffic row, API log entries, `api.json`, and the relevant Storage CTX snapshot using the same request id.

This demonstrates the key purpose of API CTX: **observable ownership of execution**, not transport of client UI state.
