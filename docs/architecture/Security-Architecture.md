# Security Architecture

Security is based on separation between **identity**, **authorization**, **safe capability projection**, and **presentation**.

Authentication establishes the current identity/session. Authorization evaluates server-side policy for the requested operation and target record. Safe capabilities can be projected to the UI so metadata/expressions can hide, disable or explain operations. The API still authorizes the command independently.

Secrets such as external-provider credentials are handled by trusted commands and encrypted server-side storage rather than ordinary generic CRUD payloads. Internal API calls use a separate trusted boundary. CSRF/session protections belong to the UI host and authentication workflow.

Record-specific permissions belong to the relevant UI level/record context; request-wide platform capabilities belong under user permissions. This avoids treating a global role as a substitute for record policy.

See [Authentication and Authorization](Authentication-and-Authorization.md), [Security Guidelines](../development/Security-Guidelines.md), and [Configuration Catalog](../reference/Configuration-Catalog.md).
