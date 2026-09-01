# ManatOS canonical relationship metadata

Relationships are registered on the referencing object: its `fields` contain the foreign-key value(s), while `references.objectKey` and `references.fields` identify the canonical target. The registry can therefore derive inverse one-to-many navigation and delete impacts without duplicating inverse metadata.

Delete behavior lives under the relationship's keyed `policies` collection. `policies.delete.action` describes referential integrity (`restrict`, `cascade`, `set-null`, `unlink`) independently from `policies.delete.confirmation` (`silent`, `confirm`, `inherit`). The server always recalculates a delete plan before execution; a client preview is advisory only.

Many-to-many data should normally use an explicit canonical junction object with two many-to-one relationships. A future semantic `many-to-many` relationship can expose convenient navigation/report/designer metadata through the junction while the junction remains the physical integrity source of truth.

## Examples

### Many Principals -> one parent Principal

A self-referencing hierarchy stores the foreign key on the child/referencing row:

```ts
parent: {
  fields: ['parentId'],
  references: {
    objectKey: 'sys-principals',
    fields: ['id'],
  },
  cardinality: 'many-to-one',
  policies: {
    delete: {
      action: 'set-null',
      confirmation: 'confirm',
    },
  },
}
```

Deleting a parent therefore does not require duplicate inverse metadata on `sys-principals`. The registry can discover all rows whose `parentId` points to the target and can plan the declared `set-null` effect.

### Many Licenses -> one Principal

```ts
principal: {
  fields: ['principalId'],
  references: {
    objectKey: 'sys-principals',
    fields: ['id'],
  },
  cardinality: 'many-to-one',
  policies: {
    delete: {
      action: 'set-null',
      confirmation: 'confirm',
    },
  },
}
```

The same canonical relationship can support several consumers without extra relationship definitions: delete-impact calculation, a Principal's read-only related-Licenses tab, reference labels, future reporting, and future relationship designers.

### Restrict deletion

Use `restrict` when the referenced record must remain while dependants exist:

```ts
policies: {
  delete: {
    action: 'restrict',
    confirmation: 'inherit',
  },
}
```

The server still recalculates the impact at execution time. A UI may preview the blocking records, but that preview is never the authority for referential integrity.

### Cascade deletion

Use `cascade` only when the dependant object's lifecycle is genuinely owned by the referenced record:

```ts
policies: {
  delete: {
    action: 'cascade',
    confirmation: 'confirm',
  },
}
```

`cascade` is a data-lifecycle rule, not a convenience for making deletion succeed. Prefer `set-null` or `unlink` when dependant records remain meaningful independently.

### Many-to-many through a junction object

For two independent objects, keep the physical relation explicit:

```text
SysUser 1 ---- * SysUserPrincipal * ---- 1 SysPrincipal
```

`SysUserPrincipal` stores the two foreign keys and declares two ordinary many-to-one relationships. A future semantic many-to-many projection may expose `SysUser.principals` and `SysPrincipal.users`, but the junction object remains the canonical persistence and referential-integrity source of truth.

## Relationship metadata vs UI metadata

Relationship metadata answers what records are related and what integrity policy applies. UI metadata decides how that relationship is presented. For example, a Principal entry can declare a read-only Licenses tab whose source queries `sys-licenses` by `principalId`; that UI declaration consumes the relationship semantics but does not redefine them.
