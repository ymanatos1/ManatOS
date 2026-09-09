# Users and Principals

A **User** is an account/authentication identity. A **Principal** is the generalized business identity used for people and organizations. Separating these concepts prevents authentication concerns from becoming the domain representation of every person or organization.

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

User administration combines generic entity fields with authentication and external-identity presentation. Passwords, provider credentials and other secret-bearing workflows are not ordinary SysBO fields and remain behind trusted auth/command boundaries.

This separation allows the same Principal model to participate in organization hierarchy, contact information and future CRM relationships without implying that every Principal is a login account.
