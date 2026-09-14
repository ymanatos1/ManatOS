# Client Contract Catalog

## Purpose

This catalog identifies the portable contracts a ManatOS client may consume. It deliberately separates those contracts from the current Node.js/Express/EJS implementation.

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

Current Express client only: EJS template paths, Bootstrap markup, Express middleware/session mechanics, DOM implementation, local filesystem discovery of API diagnostic artifacts.

See the specialized catalogs for exact API, metadata, CTX, storage and configuration shapes.
