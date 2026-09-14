# Entity Catalog

The canonical registry currently includes these system-owned entities/value/link objects. `SysBO` naming identifies system-owned objects; the underlying entity infrastructure is also intended for future application-defined, non-systemic entities.

| Key                               | Owner             | Role                                                        |
| --------------------------------- | ----------------- | ----------------------------------------------------------- |
| `sys-users`                       | ManatOS company   | user/account entity and link to optional Person Principal   |
| `external-identities`             | ManatOS company   | external identity associated with a user/provider           |
| `sys-ext-auth-providers`          | ManatOS company   | external authentication-provider configuration              |
| `sys-principals`                  | ManatOS company   | generalized person/organization identity and hierarchy node |
| `sys-licenses`                    | ManatOS company   | customer/platform/application licensing record              |
| `sys-configurations`              | ManatOS company   | typed system configuration records                          |
| `sys-email-addresses`             | ManatOS company   | normalized reusable email-address value                     |
| `sys-principal-email-addresses`   | ManatOS company   | Principal ↔ email link                                      |
| `sys-telephone-numbers`           | ManatOS company   | normalized reusable telephone value                         |
| `sys-principal-telephone-numbers` | ManatOS company   | Principal ↔ telephone link                                  |
| `sys-addresses`                   | ManatOS company   | structured postal-address value                             |
| `sys-principal-addresses`         | ManatOS company   | Principal ↔ postal-address link                             |
| `sys-applications`                | protoCRM platform | platform application definition                             |

Some value/link entities are infrastructure-managed and do not require independent navigation/UI administration. Canonical metadata remains available because relationships, persistence and components still need their semantics.

For company relationships see [ManatOS Company Domain](../company/README.md); for platform-owned Applications see [protoCRM Domain Model](../platforms/protocrm/Domain-Model.md); for generic relationship mechanics see [Relationships](Relationships.md).
