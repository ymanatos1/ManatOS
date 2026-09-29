# Entity Catalog

The canonical registry currently includes these system-owned entities/value/link objects. `SysBO` naming identifies system-owned objects; the underlying entity infrastructure is also intended for future application-defined, non-systemic entities.

| Key                               | Owner             | Role                                                        |
| --------------------------------- | ----------------- | ----------------------------------------------------------- |
| `sys-users`                       | Company domain    | user/account entity and link to optional Person Principal   |
| `external-identities`             | Company domain    | external identity associated with a user/provider           |
| `sys-ext-auth-providers`          | Company domain    | external authentication-provider configuration              |
| `sys-principals`                  | Company domain    | generalized person/organization identity and hierarchy node |
| `sys-licenses`                    | Company domain    | customer/platform/application licensing record              |
| `sys-configurations`              | Company domain    | typed system configuration records                          |
| `sys-email-addresses`             | Company domain    | normalized reusable email-address value                     |
| `sys-principal-email-addresses`   | Company domain    | Principal ↔ email link                                      |
| `sys-telephone-numbers`           | Company domain    | normalized reusable telephone value                         |
| `sys-principal-telephone-numbers` | Company domain    | Principal ↔ telephone link                                  |
| `sys-addresses`                   | Company domain    | structured postal-address value                             |
| `sys-principal-addresses`         | Company domain    | Principal ↔ postal-address link                             |
| `sys-applications`                | protoCRM platform | platform application definition                             |

Some value/link entities are infrastructure-managed and do not require independent navigation/UI administration. Canonical metadata remains available because relationships, persistence and components still need their semantics.

For company relationships see [Company Domain](../company/README.md); for platform-owned Applications see [protoCRM Domain Model](../platforms/protocrm/Domain-Model.md); for generic relationship mechanics see [Relationships](Relationships.md).
