# Security Guidelines

- Treat the API as the authority for authorization and persisted validation.
- Never rely on hidden/disabled UI as an access-control mechanism.
- Keep secrets out of CTX, generic entity responses, logs and client configuration.
- Use trusted commands for credential mutation and other security-sensitive operations.
- Preserve CSRF/session protections on browser workflows.
- Project only safe capability facts required for presentation.
- Keep internal API boundaries separately authenticated.
- Add negative authorization tests whenever a privileged operation is introduced.
- Do not commit `.env` secrets; use environment/runtime configuration.

See [Security Architecture](Security-Architecture.md).

## Security review by boundary

When adding an entity, component, expression function or API route, identify its trust boundary explicitly. Client-side field visibility is not access control; metadata from an API response is not a secret vault; a cross-origin policy does not authenticate a caller; a browser cookie requires appropriate CSRF defenses; and a diagnostic view must not leak credentials or tokens.

Native OAuth requires one-time claim and approval controls in addition to provider callback validation. Workspace commits require transaction and dependency validation in addition to ordinary CRUD authorization. Localized output must remain escaped in its final HTML/URL/attribute context. See [Security Architecture](Security-Architecture.md) for the threat-to-control model.
