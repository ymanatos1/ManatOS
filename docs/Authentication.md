# Authentication

Registration creates SysUser role Guest. A customer relationship later promotes an ordinary Guest to User. Admin is not automatically changed by commercial relationships.

## Email registration

Requires unique user-name, unique email and local password.

## External registration

Microsoft, Google, Facebook and GitHub authenticate first. Before creating the account, the UI checks email uniqueness. If available, it displays the provider email read-only and asks for a unique user-name and an optional password. Provider profile data may supply a normalized user-name suggestion, but the user remains free to change it before account creation.

Provider subject + provider name identifies the external identity. Matching email alone never silently links two accounts.

## External-provider configuration

Provider definitions and callback paths are code-defined. Admins configure one record per supported provider through **Configuration > External authentication**. Client ID and Client Secret are treated as one credential pair. Admins may save the pair before successful provider verification; it is encrypted at rest and persisted with `credentialsVerified=false`. The provider is treated as not configured for sign-in until the stored pair successfully completes the real OAuth test, which persists `credentialsVerified=true` and `credentialsVerifiedAt`. Client secrets are never returned in plaintext by normal provider reads after storage.

### External-provider API presentation and access

The implementation keeps the full provider/credential/verification domain model, but presents it in four clear layers:

| Layer | Typical operations | Access | Intended caller |
| --- | --- | --- | --- |
| Provider configuration | list/create/update/delete provider records; provider definitions | **Admin only** with API Bearer token | Admin tools / ManatOS UI |
| Credential management | store/replace an encrypted credential pair; remove credentials | **Trusted Admin/BFF**: Admin Bearer token **and** `x-internal-api-key` | ManatOS UI server/BFF |
| Verification workflow | obtain a stored pair for testing; persist successful verification; temporary OAuth test state/callback/status | **Internal UI workflow only** | ManatOS UI server and OAuth callback flow |
| Runtime availability | anonymous-safe providers currently usable for sign-in | **Public/anonymous** | Sign-in / registration UI |

The internal verification workflow is deliberately not a general-purpose client API. In particular, API clients must not mark `credentialsVerified` directly: it is persisted, read-only, application-managed state and becomes `true` only after the real provider OAuth test succeeds. Swagger groups these operations separately and Postman places routine provider/credential-management examples with the provider collection while keeping verification mechanics documented as internal infrastructure.

## Password

A local password is optional for external-only accounts. Sign-in accepts either email or user-name when a password exists.

Policy: minimum 9 characters, at least one alphabetic, one numeric and one symbol character. Passwords use Argon2id.

## Welcome + verification

Welcome and verification are one email. A provider-verified email can be marked verified immediately; otherwise the combined email contains a verification link.

## Forgot or set password

The public request takes email/user-name but always responds generically. A random one-time token is generated and only a SHA-256 hash is retained in the transient token store. A successful set/reset sends a password-change notification email.

## Customer-first onboarding scaffold

`SysUserInvitation` is included for the case where a customer/principal exists before a website account. It stores customer relationship intent plus a **hashed** activation token and expiry. The complete purchase/provisioning UI is intentionally deferred, but the data boundary is already available.


## API login and access-token sessions

The REST API provides public registration/login endpoints:

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
```

API login accepts either user-name or email plus local password. The account must have a verified email address before an API access token is issued.

The API deliberately supports multiple concurrent sessions. Each successful login creates a separate opaque Bearer token/session. Session tracking can retain non-security-critical client information when available, including `x-client-name`, user agent and client IP.

Authenticated session endpoints are:

```text
GET  /api/v1/auth/me
GET  /api/v1/auth/sessions
POST /api/v1/auth/logout
POST /api/v1/auth/logout-all
PUT  /api/v1/auth/password
```

`GET /sessions` lists the current user's active API sessions. `POST /logout` revokes only the current session. `POST /logout-all` revokes every active API session for that user, including the session making the request.

API access-token sessions are separate from Express/EJS browser sessions and are not business data.

## Authentication response convention

Registration, login, logout, logout-all and password changes are commands, so successful responses include a root `message` alongside `success` and `data`. Read endpoints such as `/me` and `/sessions` return `success + data` without a success message. Failures expose the user-facing message at the root and inside the `error` object.
