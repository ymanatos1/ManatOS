# Debugging and Developer Tools

The built-in Developer Tools are designed for runtime-model inspection rather than only console logging.

**CTX Viewer** exposes the live context tree, recursive UI levels, semantic values and targeted path views. Target tabs can retain their requested path even while a node is temporarily absent and reactivate when it returns. Selection, expansion, history, properties and copy-path/value operations support investigation without changing application state. Find is a focused debugger service: it searches the displayed CTX by key/value using literal, wildcard or regular-expression matching, retains debugger-local search history, and navigates matches without copying semantic CTX into debugger state.

**API Traffic** exposes UI→API activity for correlation with CTX changes and user actions. **Debugging CLI** supports context/expression-oriented investigation.

The tools can detach into a secondary browser window. Detachment moves the single live developer-tools DOM/runtime instance; it does not clone CTX or create duplicate subscriptions. Workspace presentation preferences can survive ordinary navigation/reload and server restarts, while runtime CTX values and traffic remain live data rather than persisted application state.

Use the tools to answer ownership questions: which level owns a field, which value changed, which API operation occurred, and whether a derived state follows the expected dependency.

The Debugging CLI uses the same expression compilation boundary and runtime-local AST cache semantics as metadata evaluation; it does not own a separate parser or semantic AST copy. Enter `help` (or `?`) for the CTX path quick reference. Both the entity-entry Debugging-tab CLI and the CTX Viewer dock are instances of the same dynamically initialized component; a CLI inserted after shell startup must behave identically to one present at initial page load.
