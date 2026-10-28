# Repository Structure

The TypeScript solution is an eight-workspace npm repository. The separation is architectural: canonical domain and expression semantics do not depend on presentation; the semantic UI runtime does not depend on a browser framework; the API independently enforces domain and authorization rules; concrete clients supply rendering and hosting.

```text
src/
├─ shared/             domain, metadata, CTX, expressions, multilingual, policies
├─ api/                Express API, authentication, authorization, storage
├─ shared.UI/          framework-independent UIS runtime and components
├─ shared.UI.NG/       Angular presentation adapter and components
├─ shared.UI.EJS/      EJS/browser presentation adapter and components
├─ ui.NG1/            Angular application and Node UI host
├─ ui.EJS1/           EJS application using the shared UIS runtime
├─ ui.EJS0/           established EJS application and its own UI runtime
├─ docs/               subject-organized documentation and diagrams
├─ scripts/            orchestration, build verification, developer utilities
└─ data/               local persisted application data
```

## Workspace responsibilities

| Workspace | Principal source locations | Responsibility |
|---|---|---|
| `shared` | `src/domain/`, `src/metadata/`, `src/context/`, `src/expressions/`, `src/multilingual/` | Canonical meaning; type contracts; CTX and expression interpreter; platform and subsystem catalogues |
| `api` | `src/auth/`, `src/http/`, `src/services/`, `src/storage/` | Authoritative HTTP operations, identity, permissions, persistence and transactional behavior |
| `shared.UI` | `src/runtime/`, `src/components/`, `src/flows/`, `src/popups/`, `src/pages/` | UIS state, ownership, invocation, fields, Lists, Entries, Flows, reactivity and diagnostics |
| `shared.UI.NG` | `src/components/` | Angular components/templates bound to shared semantic components |
| `shared.UI.EJS` | `src/components/` | Browser/EJS counterpart for shared UIS components |
| `ui.NG1` | `src/app/`, `src/host/` | Angular shell, browser routing and Node host-side authentication integration |
| `ui.EJS1` | `src/` and `views/` | Express/EJS host and shared UIS integration |
| `ui.EJS0` | `src/`, `views/`, `public/` | Established metadata-driven EJS implementation, including its distinct presentation model |

The exact npm workspace names and script entry points are declared in the repository-root `package.json`. Native clients are outside this TypeScript workspace inventory. Their existence illustrates portability of the semantic contracts; the native implementations are not part of this reference.

## Dependency direction

```text
                    shared
          ┌───────────┴────────────┐
          ▼                        ▼
         api                   shared.UI
                                  │
                     ┌────────────┴───────────┐
                     ▼                        ▼
                 shared.UI.NG             shared.UI.EJS
                     │                        │
                     ▼                        ▼
                   ui.NG1                   ui.EJS1

    ui.EJS0 ─── established EJS client consuming shared/API contracts
```

The graph shows semantic dependencies, not a mandatory process-level call chain. UI hosts communicate with the API over HTTP; they do **not** import server-side authorization enforcement. The API does not depend on Angular or EJS components. `ui.EJS0` remains a separate client, not a component of the newer shared UIS host.

## Notable internal boundaries

- **CTX:** `shared/src/context/`; root and request-specific runtime construction belong to their respective hosts.
- **Interpreter:** `shared/src/expressions/{tokenizer,parser,resolver,evaluator,types}.ts`; registered functions are under `functions/registry.ts`.
- **Surface ownership:** `shared.UI/src/runtime/surface/{host-runtime,host-level-runtime,embedded-runtime,lifecycle}.ts`.
- **List/Entry:** `shared.UI/src/components/{list,entry}/`; typed field behavior is under `components/fields/types/`.
- **UI adapters:** `shared.UI.NG/src/components/` and `shared.UI.EJS/src/components/` expose concrete rendering and event integration.
- **Authorization:** `api/src/auth/authorization-service.ts` and API route guards; client authorization projections are in `shared.UI/src/authorization/`.
- **Storage:** `api/src/storage/`; registered engine definitions must not be mistaken for working backend implementations.

Generated `dist/` bundles, Angular caches, Node dependencies and browser build outputs are artifacts, not additional source workspaces.

## Where to continue

See [System Architecture](../system/System-Architecture.md), [UIS Architecture](../clients/UIS-Architecture.md), [CTX Architecture](../context/Context-Architecture.md), [API Architecture](../api/API-Architecture.md) and [Building and Running](Building-and-Running.md).
