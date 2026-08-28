# Runtime Configuration

## Purpose

ManatOS separates **deployment/bootstrap secrets** from **Admin-maintainable runtime configuration**.

`SysConfiguration` is a persisted SysBO used for typed, grouped application settings that administrators may inspect and update from **Configuration > Configuration**. Missing configuration records are seeded from environment/default values when the API starts.

## Resolution model

For settings that are represented by `SysConfiguration`, the effective value follows this model:

```text
code default / .env bootstrap value
            ↓
seed missing SysConfiguration record
            ↓
persisted SysConfiguration value
            ↓
runtime cache / service-specific consumer
```

Environment files therefore remain useful for first-run defaults and deployment bootstrap, but they are no longer the only source of application configuration.

## Sensitive values

`SysConfiguration` supports sensitive values. `SMTP_PASSWORD` is the current example.

Sensitive values are encrypted with the existing AES-GCM `SecretsEncryptionService` and stored in `valueEncrypted`. Normal configuration reads never return plaintext or ciphertext; clients receive only the fact that a secret is configured.

The encryption/trust roots themselves must remain outside the datastore they protect:

- `SECRETS_ENCRYPTION_KEY`
- `SECRETS_ENCRYPTION_ACTIVE_KEY_ID`
- `INTERNAL_API_KEY`
- `SESSION_SECRET`

These remain deployment/environment secrets.

## Current configuration groups

The Admin UI groups settings by purpose:

- **UI** — page-size choices/defaults.
- **API** — API paging limits/defaults.
- **Errors & diagnostics** — UI technical detail and API error-detail level.
- **Sessions** — bounded UI session error-log size.
- **Logging** — API console threshold.
- **Mail** — mail enablement, sender identity and SMTP settings, including encrypted password.

## Runtime versus restart-required settings

Some values are consumed dynamically through the runtime configuration cache. Others are marked **Restart required** because the corresponding service is constructed during API startup. SMTP transport settings are currently restart-required so a partial live reconfiguration cannot leave Nodemailer in an ambiguous state.

## Administration API

Configuration management is Admin-only.

```text
GET   /api/v1/SysConfigurations
PATCH /api/v1/SysConfigurations/{id}/value
```

The PATCH endpoint validates values according to the setting metadata and preserves secret confidentiality.
