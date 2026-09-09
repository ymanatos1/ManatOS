# Building and Running

Install workspace dependencies with `npm install` at repository root. Environment templates live in `api/.env.example` and `ui/.env.example`; secrets belong in server/runtime configuration and must not be committed.

The authoritative repository verification command is:

```text
npm run verify
```

It runs linting, Prettier checks, TypeScript builds and API/UI test suites. `npm run verifyrun` verifies first and starts the development processes only after a green verification. The development process runs the shared compiler watcher plus API and UI servers.

Default development URLs are configuration-driven; the common local setup uses UI on port 3001 and API on port 3000. Deployment can place a reverse proxy in front of both processes.

See [Configuration Reference](../reference/Configuration-Catalog.md) and [Testing](Testing.md).
