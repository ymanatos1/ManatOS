# API Catalog

The API surface is organized by responsibility rather than documented here as a frozen generated endpoint list. OpenAPI/Swagger is the executable endpoint-level reference; this catalog explains endpoint families.

| Family                       | Responsibility                                                             |
| ---------------------------- | -------------------------------------------------------------------------- |
| generic SysBO routes         | metadata-aware list/read/create/update/delete behavior                     |
| SysUser commands             | protected account/user operations that exceed generic CRUD                 |
| external-auth-provider admin | protected provider credential/configuration operations                     |
| expression capability        | server-side evaluation where server capabilities are required              |
| platform capability          | safe platform access/capability projection                                 |
| configuration                | protected typed configuration operations                                   |
| public/server routes         | bootstrap/liveness/readiness and safe public facts                         |
| internal routes              | trusted UI-server↔API operations for auth/email/identity/account workflows |

All protected operations are independently authorized. Query contracts carry filters/paging and structured exception predicates toward storage. Responses use consistent query/command/failure envelopes.

Consult the running Swagger UI/OpenAPI document for exact paths, methods and schemas.
