# ManatOS

ManatOS is a metadata-driven, multi-platform application framework built around a shared business-object model, a canonical context tree (CTX), and a declarative expression evaluator.

The repository currently contains the ManatOS runtime and the first platform implementation, **protoCRM**.

## Architecture

ManatOS is organized as a workspace with three principal packages:

- **`shared`** — canonical SysBO definitions, metadata contracts, expression parsing/evaluation, shared presentation rules, and framework-neutral types.
- **`api`** — Express API, persistence, authentication/authorization, metadata endpoints, and business/domain services.
- **`ui`** — metadata-driven web UI, page/CTX construction, reusable presentation components, hierarchy workspaces, Developer Tools, and platform-specific presentation.
- **`documentation`** — durable architectural, API, UI, security, and development documentation.
- **Postman collection/environment** — executable API exploration and contract verification support.

The design principle is that business-object structure and presentation behavior should be declared in metadata wherever practical, while security enforcement, persistence transactions, datastore access, and other side effects remain authoritative server/domain responsibilities.

## Metadata-driven SysBO UI

SysBO entities are described by canonical metadata and UI metadata rather than entity-specific page implementations.

The generic UI infrastructure provides:

- metadata-driven list and entry pages;
- tabs, fields, actions, validation and dynamic presentation;
- reusable entity-field components;
- option/enum presentation;
- list filtering, searching, sorting and paging;
- reusable entity-selection popups;
- CTX-backed dynamic values and expressions;
- calculated fields and inspectable formula/current-value behavior.

Entity-specific hardcoding in generic renderers should be avoided. Behavior that applies to metadata-driven entities belongs in reusable metadata, CTX, evaluator, field-component, or presentation infrastructure.

## CTX and declarative evaluation

The canonical CTX tree is the runtime decision and inspection surface used by metadata-driven presentation.

Its major branches include:

```text
ctx
  company
  system
  entities
  user
    permissions
  page
```

Page contexts represent list, entry, hierarchy, and nested selection contexts. Dynamic metadata is evaluated against the appropriate CTX scope.

Expressions are parsed into an AST and evaluated by the shared evaluator. Repeated browser-side calculations consume the canonical parsed representation rather than independently reparsing expression strings.

The evaluator is intended primarily for deterministic decisions over already-resolved facts. Persistence, datastore queries, security enforcement, relationship mutation, and transactional side effects remain outside browser expression evaluation.

## Lists and selection contexts

Normal SysBO lists and entity-selection popups use the same reusable listing concepts.

Canonical list exceptions can be declared as expressions and applied consistently to list/query contexts. Selection popups may add operation-specific exclusions while preserving the same underlying list semantics.

This keeps filtering and eligibility rules inspectable through CTX and suitable for translation through the API/storage query pipeline rather than duplicating ad-hoc UI filtering logic.

## Principal organizations

Principals support organization/hierarchy visualization and editing.

The hierarchy workspace provides:

- tree and chart representations;
- creation of a new organization aggregate;
- editing an organization rooted in persisted Principals;
- adding new or existing Principals;
- parent/sibling relationship operations;
- drag/drop hierarchy editing;
- shared eligibility and no-op relationship rules;
- persisted-entry indicators;
- commit preview with summary/details;
- aggregate transactional commit.

The Organization tab on an individual Principal entry is intentionally informative; the dedicated Organization workspace owns hierarchy mutation.

Create Organization may maintain its own draft working state. Editing an existing organization operates independently of that create draft. A successful commit persists the aggregate, clears the applicable create draft, and returns to the Principals list.

## Developer Tools

ManatOS includes developer-facing runtime inspection tools integrated into one reserved developer-tools dock.

The tools include:

- **CTX Viewer** — inspect the canonical runtime context tree, nested page/selection contexts, fields, state, expressions and derived values.
- **API Traffic Viewer** — inspect UI/API traffic and request counters for the current system run.
- **CLI instances** — reusable console-style interaction with independent starting paths/history where applicable.

The shell owns one developer-tools column so the tools do not alter normal workspace height or page layout. Transient runtime/debug state is scoped according to the ManatOS system run rather than ordinary page navigation.

## Security

UI visibility and enabled-state decisions may consume trusted permission/capability facts projected into CTX, but browser CTX is never an authorization boundary.

The API remains authoritative for authentication, authorization, record access, relationship rules, credential lifecycle, and persistence.

Secrets such as session secrets, internal API keys, provider credentials, and encryption material belong only in server-side configuration/storage and must never be exposed to browser bundles or public client configuration.

## External authentication

External authentication providers are represented as metadata-driven configuration entities.

Provider-defined values such as callback paths are system-controlled where appropriate. Provider presentation, including labels and icons, is supplied through reusable metadata/presentation infrastructure rather than entity-specific renderer branches.

Credential/secret handling remains server-side.

## Development

Install dependencies and build/run the repository using the npm workspace scripts defined by the project.

The authoritative repository verification command is:

```bash
npm run verifyrun
```

`verifyrun` performs the project verification and starts the system only after verification succeeds.

Generated build output should not be committed as source changes unless explicitly required by repository policy.

## Documentation policy

Files under `documentation/` describe the **current durable architecture, contracts, behavior, security model, APIs, and development conventions**.

They are not a development diary, patch log, backlog, progress tracker, or place for pending-work notes.

Historical implementation progress and outstanding recommendations may be retained only in the explicitly designated architectural audit:

`ManatOS_DeclarativeEvaluator_Audit_20260830.md`

That audit is intentionally exceptional and should clearly distinguish historical findings from the current implemented architecture.

## Project status

ManatOS is under active development. The repository documentation should nevertheless describe the implemented system as it exists at the documented revision, not narrate the sequence by which it was built.
