# Adding an API Capability

Add an explicit API capability when an operation has semantics that should not be represented as generic CRUD: authorization preflight, credential lifecycle, verification, transactional mutation, side effects, or a named business command are typical examples.

## Design sequence

1. Define the operation's domain meaning and authoritative inputs.
2. Decide whether it belongs in an existing service or requires a new service boundary.
3. Define authorization before wiring the route.
4. Keep the route thin: parse/validate transport input, call the authoritative service, and return the standard response envelope.
5. Add integration coverage for both allowed and denied cases, including record-specific policy where applicable.
6. Expose only the minimum safe result required by the caller.

```text
HTTP request
   |
   v
route adapter
   |
   +--> authentication / authorization
   |
   v
service / domain operation
   |
   +--> storage / external side effect
   |
   v
standard response envelope
```

Do not add a command solely to avoid using canonical entity metadata or generic CRUD when the operation is truly ordinary entity persistence. Conversely, do not force secret-bearing or transactional workflows through generic PATCH simply because the target record is a SysBO.

See [API Architecture](../architecture/API-Architecture.md) and [Security Guidelines](Security-Guidelines.md).
