# Client Contract Catalog

## Purpose

This catalog identifies the portable contracts a ManatOS client may consume. It deliberately separates those contracts from the TypeScript UIS implementations and established EJS0 client.

| Contract                          | Server authority               | Client use                                                                         |
| --------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| Canonical entity metadata         | API/shared semantics           | understand fields, relationships, defaults, calculations and entity identity       |
| UI metadata                       | metadata contract              | compose lists/entries/tabs/components/actions when implementing metadata-driven UI |
| Collection capabilities           | AuthorizationService/API       | navigation, list/create availability                                               |
| Record capabilities               | AuthorizationService/API       | entry/row read/create/update/delete presentation                                   |
| Platform capabilities             | AuthorizationService/API       | platform-level functions such as protoCRM Apps Playground                          |
| Query/list API                    | API/storage pipeline           | authorized rows, filtering, sorting and paging                                     |
| Command APIs                      | API/domain services            | explicit business/security-sensitive operations                                    |
| Standard response/error envelopes | API                            | transport/error handling                                                           |
| Expression source semantics       | shared expression language     | declarative calculations/presentation where supported                              |
| Client CTX/context semantics      | client runtime contract        | observable UI state and expression scope                                           |
| Request correlation ID            | client/API diagnostic contract | correlate traffic with API logs/CTX/snapshots                                      |

## Authorization role outcome reference

The API remains authoritative; this table is a semantic reference, not an instruction to hardcode role checks in clients.

| Surface/data                  | Guest       | User             | Superuser                    | Admin               |
| ----------------------------- | ----------- | ---------------- | ---------------------------- | ------------------- |
| Users                         | own row     | own row          | own row, inspection          | full administration |
| Principals                    | unavailable | own organization | own organization, inspection | full administration |
| Licenses                      | unavailable | own organization | own organization, inspection | full administration |
| Applications                  | unavailable | unavailable      | inspect/read                 | full administration |
| Apps Playground               | unavailable | unavailable      | execute/use                  | full access         |
| External Authentication       | unavailable | unavailable      | inspect/read                 | full administration |
| System Configuration/Settings | unavailable | unavailable      | inspect/read                 | full administration |

Superuser's Apps Playground access is a **platform capability** and does not imply Applications update/create/delete capability.

## Client-neutral versus current implementation

Portable: metadata meanings, capabilities, API operations, security outcomes, context semantics, correlation identity.

Host-specific rather than portable: Angular/EJS components, EJS templates, browser DOM/focus handling, Node session middleware and development filesystem access. EJS0 has its own established renderer and state model; NG1/EJS1 consume the common `shared.UI` contracts.

See the specialized catalogs for exact API, metadata, CTX, storage and configuration shapes.

## Semantic host contract and error ownership

The runtime must receive the same category of canonical inputs regardless of presentation technology: metadata, current CTX facts, authorization projections, resource/query services, invocation parameters and lifecycle control. The host may change routing or how a popup is drawn; it must not change which source owns the Entry values or which API rule authorizes a save.

Host operations have three distinct results: (1) transport resources and remote data; (2) semantic state transitions in shared runtime; (3) presentation effects such as focus, scroll or window management. Do not represent failure at one boundary as success at another. For example, a dismissed modal says nothing about whether a transaction was committed, and a disabled button is not a server-side authorization check.

The integration between a runtime and its host is explicit through surface invocation and resource interfaces (`shared.UI/src/runtime/surface/{invocation,resource-port}.ts`); adapters use the same concepts while their concrete implementations differ. Async result delivery must check surface identity and lifecycle before updating state.
