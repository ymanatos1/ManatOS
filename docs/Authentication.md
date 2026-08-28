# Authentication

Registration creates SysUser role Guest. A customer relationship later promotes an ordinary Guest to User. Admin is not automatically changed by commercial relationships.

## Email registration

Requires unique user-name, unique email and local password.

## External registration

Microsoft, Google, Facebook and GitHub authenticate first. Before creating the account, the UI checks email uniqueness. If available, it displays the provider email read-only and asks for a unique user-name and an optional password. Provider profile data may supply a normalized user-name suggestion, but the user remains free to change it before account creation.

Provider subject + provider name identifies the external identity. Matching email alone never silently links two accounts.

## External-provider configuration

Provider definitions and callback paths are code-defined. Admins configure one record per supported provider through **Configuration > External authentication**. Client ID and Client Secret are treated as one credential pair; new or replacement credentials must successfully complete the provider's real OAuth flow before Save is allowed. Client secrets are encrypted at rest and never returned in plaintext after storage.

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
