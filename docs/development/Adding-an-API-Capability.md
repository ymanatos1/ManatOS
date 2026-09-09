# Adding an API Capability

Capabilities are safe facts derived from authoritative server policy. Add the policy decision at the server boundary, define the smallest safe projection needed by the client, and expose it at the correct scope: request/platform-wide facts under user permissions; record-specific facts on the relevant entity level.

UI metadata may consume the capability to control visibility/enabled state, but the command endpoint must independently authorize the operation. Never expose policy inputs, secrets or privileged internal state merely to let the browser reproduce the decision.
