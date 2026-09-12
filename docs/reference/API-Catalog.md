# API Catalog

The API surface is organized by responsibility rather than documented here as a frozen generated endpoint list. OpenAPI/Swagger is the executable endpoint-level reference; this catalog explains endpoint families and documentation ownership.

| Family                       | Responsibility                                                             |
| ---------------------------- | -------------------------------------------------------------------------- |
| generic SysBO routes         | metadata-aware list/read/create/update/delete behavior                     |
| SysBO resource routes        | record capabilities, delete impact, binary picture resources and aggregate operations where supported |
| SysUser commands             | protected account/user operations that exceed generic CRUD                 |
| external-auth-provider admin | protected provider credential/configuration operations                     |
| expression capability        | server-side evaluation where server capabilities are required              |
| platform capability          | safe platform access/capability projection                                 |
| configuration                | protected typed configuration operations                                   |
| public/server routes         | bootstrap/liveness/readiness and safe public facts                         |
| internal routes              | trusted UI-server↔API operations for auth/email/identity/account workflows |

All protected operations are independently authorized. Query contracts carry filters/paging and structured exception predicates toward storage. Responses use consistent query/command/failure envelopes.

## OpenAPI ownership

`api/src/openapi.ts` composes the executable document from responsibility-focused modules under `api/src/openapi/`:

- `schemas.ts` — reusable OpenAPI schemas.
- `common.ts` — shared parameters/responses/security helpers.
- `sysbo-operations.ts` — generic and SysBO-specific operation projection.
- `server-auth-operations.ts` — server/public/authentication operations.
- `configuration-operations.ts` — system configuration operations.
- `external-auth-operations.ts` — external-provider public/admin/credential operations.
- `internal-operations.ts` — trusted internal UI-server↔API workflow operations.

Registered business objects are presented under per-object Swagger tags such as `SysBO / Users`, `SysBO / Principals` and `SysBO / Applications`. This keeps the generic HTTP contract reusable while making the executable reference navigable by business object.

## Postman

`postman/SysApi.postman_collection.json` and `postman/SysApi.local.postman_environment.json` are maintained alongside OpenAPI. The collection includes representative generic CRUD, capabilities, picture/Pictures resources, configuration, authentication, external-provider and trusted internal workflows. When the API contract changes, OpenAPI and the maintained Postman examples should be reviewed together so neither becomes a stale parallel description.

Consult the running Swagger UI/OpenAPI document for exact paths, methods and schemas.
