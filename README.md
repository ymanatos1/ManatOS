# ManatOS developer dock placement fix — 2026-09-02

This patch corrects the Developer Tools dock layout after the API Traffic Viewer
was added beside CTX Viewer.

## Architectural invariant

The shell now owns exactly one developer-tools column. CTX Viewer and API
Traffic remain independent tools, but both live horizontally inside that single
dock. The dock is absolutely positioned inside the shell's reserved developer
column, so developer content never contributes to the application row height.

This prevents either tool from moving below the workspace, pushing the footer
down, or changing the page height. On tall pages the dock remains viewport
bounded and each viewer scrolls internally.

The shell keeps `has-debug` and `has-api-traffic` as tool visibility states and
derives one `has-developer-tools` layout state from them.
