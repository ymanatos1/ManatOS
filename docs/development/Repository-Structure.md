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
  services/      business operations
  storage/       adapters/repositories/persistence
  security/      secret protection
  audit,email,health,metadata,...

ui/src/
  auth/          UI-host auth workflows/providers
  context/       UI root context construction
  middleware/    page/session/request boundaries
  presentation/  metadata/page/popup presentation
  routes/        auth/pages/sysbo/debug routes
  runtime/       semantic runtime contracts/algorithms
  platforms/     platform UI routing/access

ui/public/js/
  runtime/       browser CTX/runtime infrastructure
  sysbo/         entity list/entry/hierarchy interaction
  popups/        popup/selector runtime
  debugger/      developer tools
  shell/         shell/connectivity/preferences
```

Tests are grouped by responsibility (`integration`, `runtime`, `metadata`, `architecture`, `security`, `presentation`, `sysbo`, etc.) rather than kept flat. Generated `dist/`, dependencies and runtime logs are not source architecture.
