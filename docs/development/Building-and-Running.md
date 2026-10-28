# Building and Running

The root `package.json` defines all eight npm workspaces, their build/test order and the developer verification scripts. Run commands from the repository root unless a workspace is explicitly selected.

| Command | Meaning |
|---|---|
| `npm install` | Install repository and workspace dependencies. |
| `npm run dev` | Run the coordinated development launcher in `scripts/dev.mjs`. |
| `npm run dev:api` | Start the API development host. |
| `npm run dev:ui.NG1` | Start the Angular/Node UI environment. |
| `npm run dev:ui.EJS1` | Start the shared-UIS EJS host. |
| `npm run dev:ui.EJS0` | Start the established EJS client. |
| `npm run build` | Build the shared libraries, adapters, API and UI hosts in root-script order. |
| `npm run test` | Run the workspace Vitest test suites in root-script order. |
| `npm run verify` | Execute `scripts/verify.mjs` (non-runtime verification). |
| `npm run verify-run` | Execute `scripts/verify-run.mjs` (verify and launch the configured environment). |
| `npm run quality:check` | Run ESLint and non-mutating Prettier checks. |

The *script spelling is significant*: the supplied repository defines **`verify-run`**, not `verifyrun`. The `--workspace` option can target an individual package, for example `npm run test --workspace shared.UI`.

For a bounded family of workspaces, the repository also provides `dev:family:api`, `dev:family:uis`, `verify:family:api`, `verify:family:uis` and the corresponding `verify-run` scripts. Check `package.json` for the exact family commands.

## Configuration boundaries

The API and each UI host have their own configuration responsibility. The repository contains example environment files at:

```text
api/.env.example
ui.EJS0/.env.example
ui.EJS1/.env.example
ui.NG1/.env.example
```

Configuration keys are not interchangeable between API and browser hosts. Internal API trust credentials remain on the server side; front-end environment values must not expose secrets. Consult [Configuration Reference](../system/Configuration-Catalog.md) and the host-specific `src/config.ts` files for effective names and constraints.

## Quality and verification

The TypeScript packages use the build/test tools appropriate to each workspace: TypeScript compilation, Angular tooling where applicable, browser bundles for EJS clients, Vitest, ESLint and Prettier. Running a build does not establish cross-browser appearance, live OAuth behavior or production authorization safety. Treat those as separate system-level verification responsibilities.

See [Testing](Testing.md), [Repository Structure](Repository-Structure.md) and [Getting Started](Getting-Started.md).
