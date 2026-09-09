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

See [Security Architecture](../architecture/Security-Architecture.md).
