# Documentation Browser

The application Documentation Browser presents the same Markdown reference material that is maintained for GitHub. This keeps the documentation available in the application without inventing a separate, diverging body of help text.

## Content contract

Documentation is organized under `docs/`, with a subject `README.md` and relative links to detailed pages. The **repository root `README.md`** is the system-wide introduction; `docs/README.md` is the detailed documentation index. Links should be written as stable relative Markdown paths where possible, rather than as development-machine absolute paths or GitHub-specific rendered URLs.

The TypeScript source implements documentation loading and presentation under `shared.UI/src/pages/documentation/` and `shared.UI/src/node/documentation-source.ts`; Angular and EJS adapters have documentation popup components. The Markdown files remain source-controlled content, not compiled templates embedded in one client.

## Viewer and window ownership

A documentation page can be displayed within the current UI or a popup window. The presentation host may manage detachable windows, page history, remembered pages, geometry and focus. These host-specific behaviors must preserve document identity and navigation. They must not require documents to contain executable scripts or depend on browser DOM globals.

The documentation itself should rely on broadly compatible Markdown: headings, fenced code, tables, ordinary links, lists and images. Avoid introducing proprietary directive syntax, interactive HTML or diagram rendering dependencies without verifying both GitHub and the application viewer. ASCII/text diagrams are an acceptable portable representation when an SVG or richer renderer is unavailable.

## Documentation architecture

- **Root README:** Full, readable project architecture in one entry point.
- **Subject README:** Define a subsystem and provide a reading map.
- **Focused document:** Own the authoritative technical detail for a concept.
- **Diagrams:** Supporting representations, not a substitute for textual contracts.
- **Indexes and catalogs:** Navigational/reference aids that must agree with the authoritative pages.

The same source content should be useful to architects, developers, designers, testers, security reviewers and readers evaluating the repository. Subject-based organization allows each reader to move from orientation to specialist detail without an audience-specific duplicate tree.

See [Documentation Standards](../development/Documentation-Standards.md), [Documentation Index](../README.md) and [UIS Architecture](../clients/UIS-Architecture.md).
