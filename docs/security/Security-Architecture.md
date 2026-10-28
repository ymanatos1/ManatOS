# Security Architecture

Security in ManatOS is a set of cooperating authority boundaries: authentication establishes identity; API authorization decides whether a particular operation is permitted; session and transport controls protect how requests cross trust boundaries; UI capability projection makes the result understandable to the user. A client is not authoritative merely because it renders or hides a control.

## Security topology

```text
Browser / installed client
      │ untrusted interaction + bearer/session material
      ▼
UI host / transport boundary
      │ browser cookie, CSRF, host rate limits as applicable
      ▼
API authentication ─► API authorization
      │                         │ entity/record/operation policy
      └─────────────┬───────────┘
                    ▼
       validation / domain services
                    ▼
       storage and protected secrets
```

Authentication is not authorization. A valid session proves which principal is acting, not that the principal may inspect every entity or mutate every relationship. Record-specific permissions belong to the relevant decision; broad platform capabilities are not substitutes for record checks. Safe capability facts may be projected into CTX for navigation and enabled-state expressions, but the API repeats the decision on each protected request.

## Session and credential boundaries

The TypeScript API maintains opaque Bearer-token sessions using `api/src/auth/access-token-store.ts`. Browser-facing NG1/EJS1 UI hosts have separate cookie/session machinery under `shared.UI/src/node/auth/`; a browser session is not simply the raw API token serialized into an ordinary readable client variable. EJS0 has a distinct established browser session integration.

Password validation, password recovery and external identity enrollment operate through trusted server workflows. Raw credentials, recovery tokens, OAuth proofs and server secrets must not enter inspectable CTX branches, translated UI labels or ordinary API Traffic logging.

## Browser and API protection

CSRF is relevant where browser cookies authorize state-changing requests; CORS controls browser cross-origin access but is **not** authentication. TLS and trusted proxy configuration protect transport and origin assumptions. Context-aware output encoding is required for application and translated text inserted into HTML. Rate limiting reduces abuse risk but does not substitute for account policy, session validation or exhaustive server-side authorization.

Internal API traffic may use a separate trusted-bridge mechanism; any such internal capability requires explicit secrets and network trust. Do not reuse it as a public browser capability.

## Native OAuth

For non-browser clients, the API implements a native OAuth start/claim/cancel interface with API-owned provider callbacks and explicit device-code approval. The installed app never needs the provider secret. Approval and verifier binding are separate controls; see [Native OAuth](Native-OAuth.md). Availability of the API operations does not by itself establish completed provider deployment, native adapter integration or adversarial security certification.

## Expressions and CTX

An expression host supplies its lexical roots, permitted functions and entity-resolver capabilities. The evaluator does not authorize or commit operations on its own. A diagnostic viewer may show CTX structure, but visibility of data in diagnostics is governed by its own privacy and host permissions. Debug tools must not turn internal state into a public API.

## Threat-oriented review

| Threat | Relevant boundary | Evidence to review |
|---|---|---|
| Forged client capability | API authorization | Endpoint and record policy tests |
| CSRF using ambient browser cookies | UI host | Token/origin validation and session-cookie rules |
| OAuth callback replay or linking abuse | API OAuth / identity | State, verifier, approval, one-time claims, link policy |
| Secret disclosure in metadata/debug logs | Server and diagnostics | Redaction/serialization and CTX data ownership |
| Expression data exfiltration | Evaluator and resolver | Capability allowance, lexical roots, delegated authorization |
| Stored or reflected XSS | Presentation boundaries | Context-specific escaping and content sanitization |
| Concurrent write/transaction inconsistency | API/storage | Operation ordering, invariants and recovery behavior |

Security evaluation requires configuration and runtime evidence as well as source inspection. Descriptive documentation is not a penetration test or a compliance certificate.

See [Authentication and Authorization](Authentication-and-Authorization.md), [Security Guidelines](Security-Guidelines.md), [Native OAuth](Native-OAuth.md) and [API Architecture](../api/API-Architecture.md).

## Layered authorization as a security boundary

User roles, business Principal relationships, resource access and purchased entitlements participate in different security decisions. A role is a broad policy input; a License represents an organization's commercial scope; a resource policy decides which specific records and operations an actor may access. An implementation that checks only the first successful dimension will grant more than the constrained intersection intended by the architecture.

```text
Authenticated User ─► role + Person Principal
                              │
                         Organization
                              │
                   License / delegation policy
                              │
                      resource relationship
                              │
                     API authorization
                              │
                        protected effect
```

The TypeScript API currently implements role-specific SysBO policy, scoped Principal/License reads and audit-related updates. The `rules` field on a License is stored text and has no established executable grant semantics. Neither client-side license displays nor platform navigation are enforcement mechanisms. The design and the precise implementation boundary are in [Authorization Policy Architecture](Authorization-Policy-Architecture.md).

A full threat analysis must include tenant-boundary crossing through related-record selectors, stale capability projections, claims of license ownership made by clients, misuse of system-administrator exceptions, direct record URLs bypassing List filters, forged resource identities and authorization drift during long-running transactions.

## Examples of security boundary failures

**Cross-organization information disclosure.** A List showing only authorized rows is not sufficient if a reference selector or record-capability endpoint can load an arbitrary GUID. Both must apply the same effective row policy before exposing a record or its existence.

**Entitlement escalation.** A customer's valid platform License must not grant every member of its organization administrative control. Eligibility to exercise an entitlement depends on organizational delegation and role/resource policy. Quantity and validity must have machine-defined semantics before they can be enforced.

**Stale UI rights.** An action remains visible after a user's membership or license changes. The API must still deny execution. Security does not depend on immediate synchronization of every CTX presentation projection.

**Policy-changing update.** A user modifies membership or ownership while a second request operates on that record. The API must evaluate authorization against authoritative facts and an appropriate consistency boundary; a previous read-time result is not a permanent permit.

These cases are useful for source review, API tests and threat modeling. See [License Entitlements](../company/License-Entitlements-and-Rules.md) for the commercial domain and [Authentication and Authorization](Authentication-and-Authorization.md) for actual API endpoints.
