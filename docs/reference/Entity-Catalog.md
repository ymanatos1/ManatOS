# Entity Catalog

The canonical BO registry currently includes these principal entities/value/link objects.

| Key                               | Role                                                        |
| --------------------------------- | ----------------------------------------------------------- |
| `sys-users`                       | user/account entity and link to optional Person Principal   |
| `external-identities`             | external identity associated with a user/provider           |
| `sys-ext-auth-providers`          | external authentication-provider configuration              |
| `sys-principals`                  | generalized person/organization identity and hierarchy node |
| `sys-applications`                | platform application definition                             |
| `sys-licenses`                    | customer/platform/application licensing record              |
| `sys-configurations`              | typed system configuration records                          |
| `sys-email-addresses`             | normalized reusable email-address value                     |
| `sys-principal-email-addresses`   | Principal ↔ email link                                      |
| `sys-telephone-numbers`           | normalized reusable telephone value                         |
| `sys-principal-telephone-numbers` | Principal ↔ telephone link                                  |
| `sys-addresses`                   | structured postal-address value                             |
| `sys-principal-addresses`         | Principal ↔ postal-address link                             |

Some value/link entities are infrastructure-managed and do not require independent navigation/UI administration. Canonical metadata remains available because relationships, persistence and components still need their semantics.

For domain relationships see [protoCRM Domain Model](../apps-design/protocrm/Domain-Model.md) and [Relationships](../design/Relationships.md).
