# License Entitlements and Rules

A License relates a purchasing or otherwise entitled **Organization Principal** to access rights for a platform and, where applicable, particular applications and capabilities. In the full policy architecture, those commercial rights become an **upper bound** on privileges available to the organization's authorized Person Principals. Authentication, organizational authority and resource authorization remain separate controls.

This subject covers license meaning and entitlement semantics. Enforcement and the overall authorization decision are specified in [Authorization Policy Architecture](../security/Authorization-Policy-Architecture.md).

## The commercial and identity model

```text
                    Platform catalogue
                           │
                       Application(s)
                           │
                  Licensed capability set
                           │
Organization Principal ── License(s)
          │
     organization tree
          │
    Person Principal ──── SysUser (login account)
          │
  organizational delegation
          │
  effective entitlement within role/resource policy
```

A License is attached to a Principal rather than to a web browser session or a particular UI technology. This preserves the independence of commercial entitlement from account authentication. A Principal may represent an organization even when the people who operate its applications change over time. A `SysUser` may authenticate a Person but is not the sole representation of that Person's commercial relationships.

It is important to distinguish **licensed scope** from **assigned authority**. A license may make a capability available to a customer organization without automatically enrolling every Person as a licensed user, designating their role, or granting them access to arbitrary records.

## The implemented License entity

The TypeScript `SysBOLicense` contract currently contains these relevant fields:

| Field | Domain significance |
|---|---|
| `principalId` | Customer/entitled Principal reference |
| `platformId` | Exactly one licensed platform |
| `applicationId?` | Optional restriction to one Application; absence means platform-wide scope in the present data model |
| `licenseKey?` | Optional license identifier |
| `rules?` | Human-readable text; maximum 4,000 characters in metadata |
| `status` | Active, Suspended, Expired, Cancelled |
| `validFrom`, `validityDuration`, `validUntil` | Calendar-aware license period |
| `quantity` | Numeric licensed quantity; default 1 |
| `description?` | Explanatory commercial information |

Canonical metadata lives in `shared/src/metadata/bo/manatos/licensing/bo-licenses.ts`. The storage-neutral type lives in `shared/src/domain/entities.ts`. `validUntil` and `validityDuration` use expression-based calculations; their calendar semantics must not be reduced to fixed-duration approximations.

Relationship metadata constrains links to Principals and Applications. The application restriction is optional; platform identity remains explicit. The license is a shared/system entity—not an entity owned by protoCRM or another consumer platform.

**Essential implementation distinction:** the presence of a `rules` string does not make it an interpreted authorization policy. Similarly, `quantity` in a stored record does not itself perform seat assignment or concurrent-use enforcement. The currently executable platform-access projection in `AuthorizationService` remains role-derived. The richer entitlement model below is the architectural meaning toward which these records contribute.

## Entitlement scope and rights

A license-based permission model needs to express multiple orthogonal constraints:

| Dimension | Example of policy meaning |
|---|---|
| Product scope | Use platform P, application A, or a defined application family |
| Capability scope | Run, configure, design, publish or administer permitted capabilities |
| Quantity | Number of assigned Persons, seats or other metered units, depending on the license contract |
| Validity | Effective date interval and status conditions |
| Organizational scope | Which customer/organization may distribute the entitlement |
| Delegation | Which Persons or groups within that organization may exercise it |
| Resource constraints | Which entities, records or operations the licensed capability covers |
| Context constraints | Explicit location, service tier or other admissible environmental condition, if defined |

The table expresses the **policy vocabulary**, not a claim that each dimension is a persisted executable field today. The current model has one platform reference and at most one application restriction; richer one-to-many application grants require a coherent, normalized contract rather than interpreting a prose blob as arbitrary executable code.

### A practical entitlement distinction

Consider an organization licensed to operate one application with ten user seats. A Person who logs in successfully is not automatically an assigned seat. An assigned Person may have permission to run that application yet lack the organization's design/publish authority. A designer may configure application metadata while a data-entry operator may edit only records within their own department. These are **different kinds of authority** even when they refer to the same License.

```text
Purchased:  Application A / 10 seats / use capability
                  │
Assigned:   Persons P1 ... P10 (organization authority)
                  │
Roles:      editor / reader / supervisor
                  │
Resource:   permitted records and actions
                  ▼
Effective rights are the constrained intersection
```

## Organization inheritance and delegation

A customer's organization hierarchy (`parentId` and `rootId` for Principals) provides a vocabulary for membership and inherited organizational scope. It does **not** imply that every descendant Principal may issue licenses, transfer a seat, or administer every descendant's data.

Any complete delegation contract needs to define who can assign capabilities, whether descendants inherit them, whether suborganizations may be excluded, how revocation works and how a Person linked to a User receives their effective rights. The authoritative API must use trusted Principal relationships, not UI-selected names or cached tree state. Reorganization and identity reassignment may invalidate previous grants.

## License rules as a controlled language

A machine-enforced rule model must be **declarative, constrained and auditable**. Its expression syntax, vocabulary, precedence and failure behavior need formal definition before license content can safely influence security. A general-purpose script, arbitrary JavaScript expression, or text-to-eval shortcut is not acceptable as an authorization boundary.

A normalized rule representation might distinguish:

```text
Entitlement
├─ subject: customer organization
├─ product: platform / application scope
├─ grant: named capability set
├─ limits: quantity / validity / assignment
├─ delegation: who may allocate or exercise it
└─ constraints: authorized resource/operation scopes
```

This is a conceptual diagram, not an existing schema. The expression evaluator is deliberately capability-restricted; its availability elsewhere in the system does not entitle license rules to invoke arbitrary entity traversal or mutating operations. Entitlement evaluation must remain server-authoritative and protect against untrusted metadata and confused-deputy scenarios.

A useful design principle is that a License supplies **commercial facts and grants**, while the authorization service computes effective rights. Neither the license UI nor the general metadata renderer becomes an authorization engine.

## Evaluation, expiry and revocation

The authoritative decision must consider status, effective dates, applicable purchased scope, organizational authority, delegation and resource policy. No stale browser-side decision can preserve an entitlement after suspension or removal. Counts and seat assignments, when enforced, must be checked consistently under concurrent operations.

A failure to load an applicable license, ambiguous grant scope or invalid machine-readable rule should not become broad access. Sensitive denial reasons can be logged safely on the server while returning only appropriate capability facts and user-facing errors.

## Integration with application design

A multi-application platform benefits from a consistent entitlement vocabulary: *design* an application, *test/run* it, *publish or package* it, and *operate* it may all be distinct capabilities. The licensing model can distinguish a developer's right to design applications from an organization's right to use one application in a runtime host. This makes commercial policy independent of whether a UI is delivered through Angular, EJS or another rendering technology.

Independent application hosting is an **architectural capability**, not evidence that a standalone host, entitlement distributor or universal license executor is currently implemented. See [Application Design and Execution](../platforms/protocrm/Application-Design-and-Execution.md).

## Responsibility and review checklist

- The API authenticates the User and resolves Person/Organization relationships.
- The License record expresses purchased scope, validity and relevant commercial restrictions.
- Organization policy determines eligible Persons and their delegated authority.
- Resource policy determines which entity operations are permitted.
- Safe capability projections support UI presentation but do not authorize requests.
- Transactions, resource queries and direct operations enforce the same effective rights.
- Audit records preserve decision provenance without exposing credentials or sensitive commercial data.


## Domain-level license evaluation

The shared domain already implements basic license predicates in `shared/src/domain/company-platform.ts`:

- `licenseIsEffective(license, at)` requires an enabled, active license with positive quantity and a valid time interval.
- `licenseGrantsPlatformAccess(license, platformId, at)` additionally matches the selected platform.
- `licenseGrantsApplicationAccess(license, platformId, applicationId, at)` additionally permits the requested application; a missing `applicationId` means the license covers that platform's applications at the *license-data* level.

Date-only `validUntil` is inclusive through the end of its UTC calendar day; invalid supplied date boundaries fail the predicate. These are meaningful, implemented **domain helpers**, but they are not a full server-side entitlement authorization service. In particular, the API's `AuthorizationService.platformCapabilities()` currently resolves platform access from the authenticated role and does not consult the License `rules` text. The intended intersection of organizational license, Person delegation, role and resource policy remains a distinct architectural concern.

## Related references

[Licensing](Licensing.md) provides the entity and UI overview; [Users and Principals](Users-and-Principals.md) and [Organizations and Hierarchies](Organizations-and-Hierarchies.md) define business identities; [Authorization Policy Architecture](../security/Authorization-Policy-Architecture.md) defines the security intersection; [Platform and Application Architecture](../platforms/Platform-and-Application-Architecture.md) defines application/product ownership.
