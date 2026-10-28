# Users and Principals

A **User** is a system-level `Company` account/authentication identity. A **Principal** is the company-level generalized business identity used for people and organizations. Separating these concepts prevents authentication concerns from becoming the representation of every person or organization.

## Relationship

A User can reference a Person Principal. The inverse relationship is represented canonically through relationship metadata rather than by maintaining unrelated duplicate identifiers.

```text
SysUser
  |
  | principalId
  v
SysPrincipal (type = Person)
  ├── firstName
  ├── lastName
  └── calculated canonical name
```

Principal presentation is conditional on Principal type. Person Principals expose personal-name fields and derive their canonical full name; company/organization principals use the canonical organization name directly. Parent and Root Principal relationships provide the organization hierarchy.

User administration combines generic entity fields with authentication and external-identity presentation. Passwords, provider credentials and other secret-bearing workflows are not ordinary entity fields and remain behind trusted authentication/command boundaries.

The same Principal model can participate in company organization hierarchy, licensing, contact information and future application relationships without implying that every Principal is a login account.

## Identity must not be confused with authority

The one-to-one Person/User relationship is an identity association, not an assertion that the User owns every record attached to the Person. A Principal may identify an organizational role or link to a parent/root organization independently of an account's local login credentials.

```text
SysUser (session / role)
   │ linked account
   ▼
Person Principal ── parentId ─► Organization Principal
   │                                 │
   │                           hierarchy / rootId
   │                                 │
   └──────── policy evaluation ◄─────┘
                     │
              License entitlement
                     │
              resource authority
```

A system can therefore authenticate a Person, locate the relevant organization, determine whether an organizational entitlement applies and separately decide whether the Person may read or mutate the requested record. The same Principal and organization facts may be used by multiple platforms or applications without duplicating account records.

**Current TypeScript boundary.** `SysBOPrincipal.userId` is the optional account link; `parentId` is the hierarchy relationship and `rootId` is a calculated/materialized root. The API authorization service resolves organization scope for selected Principal/License reads. It does not yet implement a general delegated-organization entitlement engine. See [Authorization Policy Architecture](../security/Authorization-Policy-Architecture.md).

## Membership and delegation constraints

An organization's commercial administrator, a platform designer, a record owner and an ordinary employee are distinct concepts. A relationship to the organization may establish *eligibility* for delegated privileges, but must not silently grant them. Membership changes can invalidate an earlier entitlement; role changes or account suspension can restrict a User regardless of who owns the License.

The presentation adapter may display hierarchy names and contact details, but authoritative policy should operate on stable IDs and verified links. Source-owned User and Principal metadata retain the canonical meaning of those IDs; a UI View cannot redefine a parent relationship or convert an account login into a business Principal.

See [Organizations and Hierarchies](Organizations-and-Hierarchies.md) and [License Entitlements](License-Entitlements-and-Rules.md).
