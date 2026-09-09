# Runtime Architecture

The running system consists of a shared semantic package, an API process and a UI process/browser runtime.

```text
shared contracts
   |             \
   v              v
API process     UI server
   |              |
   +---- HTTP ----+
                  |
               browser
            CTX + UI runtime
```

`shared` contains contracts that genuinely need common semantics: domain/entity metadata, UI metadata types, expression language, policies and platform definitions. It is not a dumping ground for code merely used by two packages.

The API process owns authentication, authorization, protected commands, relationship integrity, business services, storage adapters, audit/configuration and public/internal HTTP contracts. The UI process owns sessions and presentation hosting, fetches safe facts/metadata from the API, renders initial surfaces and serves browser assets. The browser owns live CTX, nested UI levels, field interaction, reactive UI decisions and developer inspection.

A reverse proxy can expose the processes as one site (`/` for UI and `/api/*` for API); deployment topology is configuration rather than a business-code assumption.

See [System Architecture](System-Architecture.md), [API Architecture](API-Architecture.md), [UI Architecture](UI-Architecture.md), and [Context Architecture](Context-Architecture.md).
