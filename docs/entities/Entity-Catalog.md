# Entity Catalog

Canonical object definitions live in `shared/src/metadata/bo/`. The registry in `shared/src/metadata/bo/registry.ts` distinguishes **first-class SysBO entities** from **related/value objects**. All share canonical metadata and relationship semantics, but not every object is exposed as an independently managed generic CRUD resource.

## Shared identity and system domain

| Key | Meaning |
|---|---|
| `sys-users` | User account and authenticated identity association |
| `sys-principals` | Person and Organization identity/hierarchy |
| `sys-email-addresses` | Reusable email-address record |
| `sys-principal-email-addresses` | Principal-to-email association |
| `sys-telephone-numbers` | Reusable telephone number |
| `sys-principal-telephone-numbers` | Principal-to-telephone association |
| `sys-addresses` | Reusable postal address |
| `sys-principal-addresses` | Principal-to-address association |
| `sys-licenses` | Principal, platform and optional application licensing |
| `sys-ext-auth-providers` | External-provider configuration |
| `sys-configurations` | Typed system configuration |

`Company` is the *technical domain identifier* for these shared entities; it is not a statement about the project's corporate identity.

## Platform-owned entities

| Key | Owner | Meaning |
|---|---|---|
| `sys-applications` | protoCRM | Application catalogue and platform-level definition |
| `sys-projects` | Panoptes | Surveillance project |
| `sys-posts` | Panoptes | Surveillance post |
| `sys-guards` | Panoptes | Surveillance guard |

protoCRM is the multi-application design and execution platform. Panoptes is a special-purpose application illustrated through platform-owned subsystem metadata. Its specialized domain is not the basis of the general entity framework.

## Canonical related/value objects

| Key | Meaning |
|---|---|
| `external-identities` | External provider identity linked to a User |
| `user-invitations` | Invitation-related canonical object |

The registry exports `allSysBOMetadata` (first-class SysBOs), `allManatOSValueObjectMetadata` and their combination `allManatOSObjectMetadata`. It validates relationship targets and compatible source/target field types before publishing the canonical relationship catalogue.

## Behavioral interpretation

An entity declaration does not itself grant read or modification rights. The API applies authentication, authorization, field rules and storage integrity at each operation. User- and license-related entities have additional restricted access policies. Generic List/Entry metadata is resolved separately from canonical business meaning.

See [Entity Model](Entity-Model.md), [Relationships](Relationships.md), [Metadata Architecture](../metadata/Metadata-Architecture.md), [Authorization](../security/Authorization-Policy-Architecture.md), [protoCRM](../platforms/protocrm/README.md).
