# ManatOS

ManatOS is a metadata-driven, multi-platform application framework built around a shared business-object model, a canonical context tree (CTX), and a declarative expression evaluator.

The repository contains the ManatOS runtime and the first platform implementation, **protoCRM**.

## Who this repository is for

ManatOS documentation is organized so the same repository can be read at different depths:

- **Architects and technical reviewers** can start with the system vision, package boundaries, security model, metadata/CTX architecture, and architectural invariants.
- **Developers and contributors** can follow the contracts into metadata definitions, API/storage behavior, UI runtime ownership, reusable components, testing, and extension guidance.
- **Power users and functional reviewers** can use the UI flow and entity/system-page guides to understand the supported workflows without first learning renderer internals.
- **Portfolio/repository visitors** can use this README as an orientation to the implemented system and then follow the architecture and representative-flow links that match their interests.

The documentation distinguishes implemented behavior from explicitly identified extension points. Git history records how the system evolved; durable documentation describes the system as it exists and the rationale that remains relevant to its architecture.

## Architecture

ManatOS is organized as a workspace with three principal packages:

- **`shared`** — canonical SysBO definitions, metadata contracts, expression parsing/evaluation, shared presentation rules, and framework-neutral types.
- **`api`** — Express API, persistence, authentication/authorization, metadata endpoints, and business/domain services.
- **`ui`** — metadata-driven web UI, page/CTX construction, reusable presentation components, hierarchy workspaces, Developer Tools, and platform-specific presentation.
- **`docs`** — durable architectural, API, UI, security, and development documentation.
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

Detailed policy, capability endpoints, list-selection enforcement and CTX projection are documented in [`docs/Authorization.md`](docs/Authorization.md).

## External authentication

External authentication providers are represented as metadata-driven configuration entities.

Provider-defined values such as callback paths are system-controlled where appropriate. Provider presentation, including labels and icons, is supplied through reusable metadata/presentation infrastructure rather than entity-specific renderer branches.

Credential/secret handling remains server-side.

## Documentation map

The complete documentation entrance is [`docs/README.md`](docs/README.md). It offers audience-oriented reading paths for architects, developers, power users and repository/portfolio visitors.

| Interest | Start here |
|---|---|
| documentation hub / choose a reading path | [`docs/README.md`](docs/README.md) |
| system vision, boundaries and major runtime responsibilities | [`docs/Architecture.md`](docs/Architecture.md) |
| canonical business-object and UI metadata | [`docs/Entity-Metadata.md`](docs/Entity-Metadata.md) |
| CTX/expression ownership and execution mechanics | [`docs/Expression-Evaluation-Mechanics.md`](docs/Expression-Evaluation-Mechanics.md) |
| authentication and authorization/security boundaries | [`docs/Authentication.md`](docs/Authentication.md), [`docs/Authorization.md`](docs/Authorization.md) |
| persistence and adapter contracts | [`docs/Storage.md`](docs/Storage.md) |
| UI architecture and component ownership | [`docs/ui/README.md`](docs/ui/README.md) |
| supported end-to-end UI workflows | [`docs/ui/UI-Flows.md`](docs/ui/UI-Flows.md) |
| metadata-driven entity pages | [`docs/ui/Entity-Pages.md`](docs/ui/Entity-Pages.md) |
| authentication/account/configuration/developer UI surfaces | [`docs/ui/System-Pages.md`](docs/ui/System-Pages.md) |
| development and verification | [`docs/Development.md`](docs/Development.md), [`docs/Testing.md`](docs/Testing.md) |

## Development

Install dependencies and build/run the repository using the npm workspace scripts defined by the project.

The authoritative repository verification command is:

```bash
npm run verifyrun
```

`verifyrun` performs the project verification and starts the system only after verification succeeds.

Generated build output should not be committed as source changes unless explicitly required by repository policy.

## Documentation policy

Files under `docs/` describe the **current durable architecture, contracts, behavior, security model, APIs, and development conventions**.

They are not a development diary, patch log, backlog, progress tracker, migration history, or place for pending-work notes. Historical audit/progress documents are not kept in the source tree; durable decisions must be incorporated into the relevant current-state document.

The authorization security boundary and capability contracts are documented in `docs/Authorization.md`.

The canonical UI documentation starts at `docs/ui/README.md`; it provides audience-oriented routes into UI architecture, supported flows, forms, entity/system pages, reusable components, composite components, and canonical entity-field components.

## Project status

ManatOS is under active development. The repository documentation should nevertheless describe the implemented system as it exists at the documented revision, not narrate the sequence by which it was built.
