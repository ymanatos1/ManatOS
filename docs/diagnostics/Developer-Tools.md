# Debugging and Developer Tools

The built-in Developer Tools in the current Express/browser client are designed for runtime-model inspection rather than only console logging.

**CTX Viewer** exposes the live context tree, recursive UI levels, semantic values and targeted path views. Target tabs can retain their requested path even while a node is temporarily absent and reactivate when it returns. Selection, expansion, history, properties and copy-path/value operations support investigation without changing application state. Find is a focused debugger service: it searches the displayed CTX by key/value using literal, wildcard or regular-expression matching, retains debugger-local search history, and navigates matches without copying semantic CTX into debugger state.

**API Traffic** exposes UI→API activity for correlation with CTX changes and user actions. Request and response details are keyed by the same request/API-call ID used by API logging and API CTX snapshots.

In co-located development deployments, the UI server can also inspect locally visible API log files. It reads the configured Storage **Debug output directory** from the shared `system-settings.json`, resolves that API-relative path against the sibling API process layout, scans the surrounding log directory, and shows every log file containing the selected request ID as an additional detail tab. This is intentionally a simple local-development facility: split-server deployments may show no log tabs until a remote diagnostic transport is introduced.

**Debugging CLI** supports context/expression-oriented investigation.

The tools can detach into a secondary browser window. Detachment moves the single live developer-tools DOM/runtime instance; it does not clone CTX or create duplicate subscriptions. Developer-workspace state is deliberately separate from application CTX. The current CTX Viewer stores its selected path, expansion set, scroll anchor, Properties state/height, width, navigation history and watched path in browser `localStorage`; those preferences therefore survive ordinary navigation/reload and currently also survive a UI-server restart. Missing selected paths recover to the nearest surviving parent when the next CTX is rendered. This persistence stores debugger coordinates only, never CTX values.

API Traffic has a different lifetime. Its transient viewer state and route counters are keyed by the current UI boot id and held in `sessionStorage`, so they survive full-page navigation within that boot but start fresh after a UI-server/system restart. Route visibility/catalog choices are durable developer preferences in `localStorage`. A detached Developer Tools window can reconnect across ordinary main-page navigation; a changed UI boot id closes that live detached window rather than allowing it to display stale runtime state.

Use the tools to answer ownership questions: which level owns a field, which value changed, which API operation occurred, and whether a derived state follows the expected dependency.

The Debugging CLI uses the same expression compilation boundary and runtime-local AST cache semantics as metadata evaluation; it does not own a separate parser or semantic AST copy. Enter `help` (or `?`) for the CTX path quick reference. Both the entity-entry Debugging-tab CLI and the CTX Viewer dock are instances of the same dynamically initialized component; a CLI inserted after shell startup must behave identically to one present at initial page load.

For another client implementation, preserve the diagnostic concepts (client runtime ownership, request correlation, API/server artifacts) without copying the current DOM/dock/filesystem implementation mechanically. See [Client Implementation Guide](../clients/Client-Implementations.md).
