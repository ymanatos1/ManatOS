# Getting Started for Developers

This is the TypeScript engineering entry point. The system comprises a shared metadata/domain foundation, an authoritative API, a framework-independent semantic UI runtime, two new presentation adapters and an established EJS client. Understand those boundaries before choosing a directory in which to extend behavior.

## First orientation

```text
                  canonical declarations
                      shared/
                     /       \
                    ▼         ▼
               API server   semantic UIS
                 api/       shared.UI/
                              /     \
                    Angular adapter  EJS adapter
                          |               |
                        ui.NG1         ui.EJS1

              ui.EJS0: established separate EJS client
```

The API is the authorization and persistence authority. UIS controls UI state, surface lifetime, semantic actions and reusable List/Entry/Field behavior. The browser adapters own presentation, event bridging, DOM behavior and framework lifecycles; they do not define business policy. The established `ui.EJS0` client has its own UI implementation and continues to use the common API/domain contracts.

The repository structure is explained in [Repository Structure](Repository-Structure.md), including every workspace and its real source directories.

## Build, verify and run

Use the exact scripts provided by the root `package.json`:

```sh
npm install
npm run build
npm run test
npm run verify
npm run verify-run
```

For focused development, use `npm run dev:api`, `npm run dev:ui.NG1`, `npm run dev:ui.EJS1` or `npm run dev:ui.EJS0`. A full coordinated launcher is available as `npm run dev`. The workspace-specific forms of `npm run build --workspace <name>` and `npm run test --workspace <name>` are also supported by npm. See [Building and Running](Building-and-Running.md) for the complete script reference.

The available example environment files are `api/.env.example`, `ui.EJS0/.env.example`, `ui.EJS1/.env.example`, and `ui.NG1/.env.example`. Configuration remains host-specific; never place API trust secrets in browser-delivered assets. Consult the [Configuration Reference](../system/Configuration-Catalog.md) and actual host `config.ts` modules.

## Before modifying a subsystem

**Canonical business semantics** belong under `shared/src/metadata/`, `shared/src/domain/`, `shared/src/expressions/` and related domain services. When adding an entity, declare its canonical schema and relationships; the API must validate and authorize the resulting operations independently of the UI.

**Shared UI semantics** belong under `shared.UI/src/`: `runtime/surface/` for hosts/lifecycle; `components/list/`, `components/entry/` and `components/fields/` for entity UI behavior; `flows/` for multi-step operations; `popups/` for reusable popup definitions; `navigation/` and `preferences/` for shared UI behavior.

**Concrete presentation** belongs under `shared.UI.NG/src/components/` and `shared.UI.EJS/src/components/`. Keep a readable correspondence between the concrete component class, its template and the shared semantic contract. The application hosts, `ui.NG1/` and `ui.EJS1/`, manage integration, bootstrap, routes, host-side sessions and resource delivery.

**API behavior** belongs under `api/src/http/`, `api/src/services/`, `api/src/auth/` and `api/src/storage/`. HTTP is a boundary; it must not delegate authorization to a UI permission projection. The server's record authorization decision is always authoritative.

**Established EJS UI** belongs under `ui.EJS0/src/`, `ui.EJS0/views/` and `ui.EJS0/public/`. Its mature functionality can be used as a behavioral reference, but its browser runtime does not define the semantic ownership contract of the newer UIS implementation.

## Typical extension paths

| Requirement | Start with | Then inspect |
|---|---|---|
| New canonical entity or relationship | `shared/src/metadata/bo/` | `api/src/services/`, `api/src/storage/`, UI metadata |
| Expression grammar change | `shared/src/expressions/tokenizer.ts` and `parser.ts` | `resolver.ts`, `evaluator.ts`, shared expression tests |
| Registered function | `shared/src/expressions/functions/registry.ts` | host capabilities, metadata use, tests |
| New typed field semantics | `shared.UI/src/components/fields/` | Entry embedded components, Angular/EJS counterparts |
| List or Entry interaction | `shared.UI/src/components/{list,entry}/` | resource ports and adapter templates |
| Popup/surface lifetime | `shared.UI/src/runtime/surface/` | adapter modal/focus ownership, nesting tests |
| Authentication workflow | `api/src/auth/` and `shared.UI/src/node/auth/` | host adapters; browser session policy |
| Platform capability | `shared/src/platforms/` | source-specific platform UI routes and API controls |
| Language presentation | `shared/src/multilingual/` | `shared.UI/src/multilingual/` and adapter rendering |

The preferred extension adds canonical meaning once, then connects each consumer through the correct contract. A change to a shared field/type contract must be reflected in every affected adapter rather than leaving divergent behavior behind.

## Authentication and local testing

An authenticated user, a Person/Organization Principal and a browser/UI session are distinct concepts. Browser sessions belong to each UI host; API Bearer token sessions belong to the API. Password, OAuth and privilege decisions cross separate trust boundaries. See [Authentication](../security/Authentication-and-Account.md), [Authorization](../security/Authorization-Policy-Architecture.md) and [Native OAuth](../security/Native-OAuth.md).

The test suites run through Vitest and are grouped by subsystem inside each workspace. The authorization matrix, expression tests and surface/adapter tests are important regression evidence; neither a passing build nor a rendered screen substitutes for authorization, transactional or browser-behavior verification. See [Testing](Testing.md).

## Source navigation discipline

Locate the *semantic owner* of a behavior before changing any concrete template. Prefer one authoritative shared contract over duplicating state or policy between Angular and EJS. For troubleshooting, inspect the runtime CTX path and the host request boundary independently: they are different lifetimes and may not contain the same facts.

See [Documentation Standards](Documentation-Standards.md), [Coding Principles](Coding-Principles.md), [Extension Points](Extension-Points.md), [UIS Architecture](../clients/UIS-Architecture.md) and [API Architecture](../api/API-Architecture.md).
