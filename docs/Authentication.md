# Authentication

Registration creates SysUser role Guest. A customer relationship later promotes an ordinary Guest to User. Admin is not automatically changed by commercial relationships.

## Email registration

Requires unique user-name, unique email and local password.

## External registration

Google/Facebook authenticate first. Before creating the account, the UI checks email uniqueness. If available, it displays the provider email read-only and asks for a unique user-name and an optional password.

Provider subject + provider name identifies the external identity. Matching email alone never silently links two accounts.

## Password

A local password is optional for external-only accounts. Sign-in accepts either email or user-name when a password exists.

Policy: minimum 9 characters, at least one alphabetic, one numeric and one symbol character. Passwords use Argon2id.

## Welcome + verification

Welcome and verification are one email. A provider-verified email can be marked verified immediately; otherwise the combined email contains a verification link.

## Forgot or set password

The public request takes email/user-name but always responds generically. A random one-time token is generated and only a SHA-256 hash is retained in the transient token store. A successful set/reset sends a password-change notification email.

## Customer-first onboarding scaffold

`SysUserInvitation` is included for the case where a customer/principal exists before a website account. It stores customer relationship intent plus a **hashed** activation token and expiry. The complete purchase/provisioning UI is intentionally deferred, but the data boundary is already available.
