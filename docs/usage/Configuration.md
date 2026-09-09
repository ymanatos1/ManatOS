# Configuration

Configuration is divided by ownership and sensitivity. Runtime/deployment settings belong to the server environment; administrable typed settings are exposed through protected configuration contracts; secret material remains behind trusted server-side storage and command boundaries.

## Administrative configuration

Protected configuration surfaces/API operations expose values according to their declared type and authorization. A secret may influence runtime behavior without its plaintext value ever being returned as ordinary configuration data.

## Deployment configuration

Environment settings configure process/runtime concerns such as API/UI endpoints, internal keys and session/security material. Server-only secrets must never be copied into browser-visible JavaScript, HTML, CTX or public bootstrap responses.

```text
Deployment environment ------> server runtime
                                  |
Administrative configuration --->|--> typed/safe runtime facts
                                  |
Encrypted secrets -------------->|--> trusted consumers only

Browser <----------------------------- safe/public projections only
```

For exact keys, defaults and ownership see [Configuration Catalog](../reference/Configuration-Catalog.md).
