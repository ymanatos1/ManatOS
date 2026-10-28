# Native OAuth: API-Mediated Authentication Contract

The native OAuth mechanism allows a non-browser client to authenticate using an external identity provider without embedding a provider login page or handling provider credentials. The native client opens the system browser, the **API** owns the provider callback, and the client claims the resulting ManatOS session through a one-time, cryptographically bound exchange.

This is a TypeScript API architecture reference. Native clients are mentioned only to explain the protocol boundary; their .NET/KMP implementation details are outside this documentation.

## Protocol participants

```text
Native client ── start(challenge) ──► ManatOS API
    │                                   │
    ├─ system browser ◄─ authorization URL
    │                                   │
    └─ claim(verifier) ───────────────► │
                                        │ OAuth callback
                                        ◄── external provider
                                        │
                              user confirms device code
                                        │
                              existing ManatOS session
```

The API routes are implemented by `api/src/http/routes/native-oauth-router.ts`, backed by `api/src/auth/native-oauth-service.ts`. The native-facing operations are **start**, **claim/poll**, and **cancel**; browser callbacks and approval pages are separate browser-facing routes. A pending claim returns a pending result rather than an authenticated session.

## Trust and identity boundaries

- The installed application is a public client and cannot retain a durable OAuth client secret.
- The provider callback is HTTPS on the API, not a native localhost listener or a custom-scheme callback.
- A client proves possession of the matching verifier for its original challenge.
- The browser-side user confirmation binds approval to a displayed code to reduce remote login-link phishing risk. Claim proof alone is not user approval.
- Provider identity must be associated through the existing trusted external-identity policy. Matching an email address must not silently link unrelated user accounts.
- The result is an ordinary ManatOS API session, with the same authorization model used for other API clients.

The service stores attempt state in process memory. Process restart expires unfinished attempts. This implementation property is important to client error handling; it is not a promise of durable multi-instance attempt coordination.

## Security controls and operational consequences

The HTTP route imposes in-memory rate limits on initiation and claim operations. Browser approval uses restricted cache and framing headers and output escaping for values inserted into browser responses. Callback values, authorization codes and proofs must not be written into ordinary access logs or diagnostic CTX snapshots.

A secure assessment needs more than route existence: verify challenge/verifier consistency, one-time claim, attempt expiry, cancellation, provider callback state, explicit user approval, replay resistance, origin/redirect policy and rate-limit behavior. Configuration and provider credentials remain server-owned.

## Relationship with browser authentication

NG1/EJS1 browser authentication uses its own UI-host/session workflows. EJS0 has another existing browser-session model. Neither is replaced by native OAuth. All flows eventually depend on the API's trusted identity and authorization boundaries.

See [Security Architecture](Security-Architecture.md), [Authentication and Account](Authentication-and-Account.md), and [API Architecture](../api/API-Architecture.md).
