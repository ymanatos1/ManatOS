# Architecture

## Public shape

A reverse proxy can expose both processes as one site:

```text
/       -> UI process (3001)
/api/*  -> API process (3000)
```

Development runs them separately. The UI API base URL is configuration-driven, so moving either process later does not change page/business code.

## SysBO metadata

A BO definition key (`sys-users`, `sys-principals`, ...) is a stable hard-coded source identifier. Record IDs are unrelated storage-generated GUIDs.

Canonical field metadata is keyed by canonical property name for fast lookup. UI metadata is a second category layered on top only by UI clients.

## Scope tree

Every EJS page gets `app.version`, `app.scopes`, `app.sysBO` and `app.navigation` through `res.locals`. The scope tree contains at least session, user, request and workspace; selecting Play on a SysApplication adds the selected application to workspace scope.

Scope state is runtime context, not business persistence.

## Security domains

- SysUser: website/security account.
- SysPrincipal: customer/commercial identity.
- SysUserPrincipal: bridge between them.
- SysLicense: owned by a principal for a SysApplication.

This avoids making customer type/hierarchy and website authentication the same concept.
