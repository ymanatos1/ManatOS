# API Architecture

The API is the authoritative boundary for business data and security-sensitive operations.

Its source is organized around `auth/`, `http/`, `services/`, `storage/`, `security/`, `audit/`, `email/`, `health/` and metadata/runtime configuration. HTTP routes adapt requests to services; services own business operations; storage adapters own persistence mechanics. Relationship integrity and authorization are not delegated to browser behavior.

Two broad endpoint classes exist: generic SysBO query/CRUD contracts and explicit protected commands for operations whose semantics or security requirements deserve a named boundary. Internal endpoints are protected separately from public/browser-facing routes.

Responses use consistent success/failure envelopes. Query parsing preserves structured filters/predicates. Capability endpoints project safe authorization facts so clients can present available operations without receiving the policy's sensitive inputs.

See [Security Architecture](Security-Architecture.md), [Data and Storage Architecture](Data-and-Storage-Architecture.md), and [API Catalog](../reference/API-Catalog.md).
