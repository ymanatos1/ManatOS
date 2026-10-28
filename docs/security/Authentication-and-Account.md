# Authentication and Account

The system supports local account/session workflows and configured external identity providers. Authentication workflows are system/security surfaces rather than ordinary entity CRUD forms.

## Local and external identity

Local authentication uses protected password/session flows. External provider availability depends on provider configuration that has passed the required credential verification lifecycle. Sensitive client secrets are never exposed through ordinary entity reads or browser-visible configuration.

## Account versus User administration

**Account** pages concern the currently authenticated person's own identity and available account operations. **Administration → Users** is a SysBO administration experience and can expose broader fields/actions according to authorization.

```text
Account
  -> current-user identity and self-service actions

Administration -> Users
  -> generic SysUser list/entry administration
  -> record-specific server policy
```

The two experiences may reuse canonical metadata and presentation where they display the same entity-backed fact, but they do not become the same page or share authorization merely because the visual data overlaps.

Password rules, verification flows and provider credential operations are enforced at trusted boundaries. Client-side validation improves usability but is not the sole security control.

## Credentials, recovery and authoritative completion

Account actions include sign-in, registration, password recovery/reset, password change, sign-out and session handling. UI flows orchestrate the sequence and prompts, but server-side credentials, verification tokens, OAuth state and session issuance remain outside inspectable presentation CTX. An error or success label is not evidence of credential acceptance; the UI must follow the authenticated server result.

The user-visible locale affects only the presentation of messages. It cannot alter which security validation is required, which token is accepted or which identity is linked to an external provider. Never link accounts solely because provider and local email labels match.
