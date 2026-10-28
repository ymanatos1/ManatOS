# Debugging and Developer Tools

The built-in Developer Tools in the TypeScript web clients are designed for runtime-model inspection rather than only console logging.

**CTX Viewer** exposes the live context tree, recursive UI levels, semantic values and targeted path views. Target tabs can retain their requested path even while a node is temporarily absent and reactivate when it returns. Selection, expansion, history, properties and copy-path/value operations support investigation without changing application state. Find is a focused debugger service: it searches the displayed CTX by key/value using literal, wildcard or regular-expression matching, retains debugger-local search history, and navigates matches without copying semantic CTX into debugger state.

**API Traffic** exposes UI→API activity for correlation with CTX changes and user actions. Request and response details are keyed by the same request/API-call ID used by API logging and API CTX snapshots.

In co-located development deployments, the UI server can also inspect locally visible API log files. It reads the configured Storage **Debug output directory** from the shared `system-settings.json`, resolves that API-relative path against the sibling API process layout, scans the surrounding log directory, and shows every log file containing the selected request ID as an additional detail tab. This is intentionally a simple local-development facility: split-server deployments may show no log tabs until a remote diagnostic transport is introduced.

**Debugging CLI** supports context/expression-oriented investigation.

The tools can detach into a secondary browser window. Detachment moves the single live developer-tools DOM/runtime instance; it does not clone CTX or create duplicate subscriptions. Workspace presentation preferences can survive ordinary navigation/reload and server restarts, while runtime CTX values and traffic remain live data rather than persisted application state.

Use the tools to answer ownership questions: which level owns a field, which value changed, which API operation occurred, and whether a derived state follows the expected dependency.

The Debugging CLI uses the same expression compilation boundary and runtime-local AST cache semantics as metadata evaluation; it does not own a separate parser or semantic AST copy. Enter `help` (or `?`) for the CTX path quick reference. Both the entity-entry Debugging-tab CLI and the CTX Viewer dock are instances of the same dynamically initialized component; a CLI inserted after shell startup must behave identically to one present at initial page load.

For another client implementation, preserve the diagnostic concepts (client runtime ownership, request correlation, API/server artifacts) without copying the current DOM/dock/filesystem implementation mechanically. See [Client Implementation Guide](../clients/Client-Implementations.md).

## CTX, Flow and surface diagnostics

The CTX Viewer inspects semantic tree state, including `ctx.ui.level` and `ctx.flow` when those branches exist. These branches represent different owners and lifecycles: a nested popup is a child UI level; a Flow step is an execution state with a current-step pointer. Diagnostics should make that distinction visible rather than manufacturing a second source of state for display.

API Traffic allows a client to inspect requests made through its configured API transport; it is not a comprehensive network interception service. Detached diagnostic windows and documentation windows have separate presentation lifecycles from the underlying canonical runtime. Sensitive identity/session material should be redacted or excluded at its source and not trusted merely because a debugger is optional.
