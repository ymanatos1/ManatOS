# Repository Structure

```text
shared/src/
  context/       shared CTX contracts/helpers
  domain/        company/platform and entity domain types
  metadata/      canonical BO and UI metadata
  expressions/   tokenizer/parser/evaluator/functions/projection
  policies/      reusable policy semantics
  presentation/  shared semantic presentation
  platforms/     platform contributions

api/src/
  auth/          authentication/session-side API concerns
  http/          response/query + middleware/routes/internal routes
  services/
    sysbo/        SysBO business services
    relationships/relationship resolution/integrity
    identity/     identity relationship services
  openapi/       executable OpenAPI schemas and operation families
  storage/       adapters/repositories/persistence
  security/      secret protection
  audit,email,health,metadata,...

ui/src/
  auth/          UI-host auth workflows/providers
  context/       UI root context construction
  middleware/    page/session/request boundaries
  presentation/  metadata/page/popup presentation
  routes/
    sysbo/
      entry/      metadata-driven entry rendering/write concerns
      list/       metadata-driven list/query concerns
      hierarchy/  hierarchy server-side data/render/write concerns
      related/    metadata-driven related collections
      shared/     shared SysBO route data access
  runtime/       semantic runtime contracts/algorithms
  platforms/     platform UI routing/access

ui/public/js/
  runtime/       browser CTX/runtime infrastructure
  sysbo/
    entry/        generic entry interaction plus focused field/expression services
    hierarchy/    workspace orchestration, graph model, draft store and relationship runtime
  popups/        popup/selector runtime
  debugger/      CTX/API developer tools plus focused Find runtime
  shell/         shell/connectivity/preferences
```

The TypeScript and browser-runtime folders are organized by responsibility rather than entity. Generic behavior belongs in these shared boundaries; entity-specific branching is justified only when the domain contract itself is entity-specific.

Large browser runtimes are decomposed only where a subsystem has a coherent ownership boundary. For example, picture-field behavior, entry expression execution, hierarchy graph semantics/draft persistence/relationship placement, and CTX Find are sibling services rather than second state authorities. Their orchestrators retain semantic CTX ownership and lifecycle coordination.

Tests are grouped by responsibility (`integration`, `runtime`, `metadata`, `architecture`, `security`, `presentation`, `sysbo`, etc.) rather than kept flat. Generated `dist/`, dependencies and runtime logs are not source architecture.
