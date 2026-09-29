# Documentation Browser

ManatOS exposes its documentation as a read-only system tool. The repository root `README.md`, the `docs/` Markdown tree, and documentation assets under `docs/` remain the single documentation source: the browser discovers and presents those same resources rather than copying documentation into a second content model.

## User experience

For a signed-in user, the horizontal system navigation places a Documentation book button between the Language selector and Developer Tools. The button opens a named, resizable browser window dedicated to documentation. It does not navigate the current ManatOS application surface.

The explorer starts with the repository `README.md`, followed by the `docs/` folder hierarchy. The documentation window has a folder/file explorer on the left and the selected resource across the main viewer area. Folders can be expanded/collapsed, `README.md` is presented as a folder overview, and the explorer width is a browser presentation preference. Markdown filenames omit the `.md` suffix; non-Markdown resources carry compact `SVG`, `PDF` or `DOT` badges so sibling representations with the same basename remain unambiguous.

The toolbar provides browser-style Back, Forward and Home actions plus a file-tree filter. The selected resource is represented by the `doc` query parameter, so refresh and browser history preserve resource identity. Relative links between Markdown documents are resolved inside the documentation browser; external links remain normal external navigation.

## Documentation resources

The controlled documentation tree supports:

- `.md` as the primary authored documentation format;
- `.svg` as the browser-native diagram representation, displayed directly in the main viewer;
- `.pdf` as the print/reference representation, displayed in the main viewer through the browser PDF viewer;
- `.dot` as the editable Graphviz source, displayed as source text.

Relative SVG images referenced from Markdown are resolved through the same documentation-resource boundary, so diagrams can also appear inline in prose. The resource manifest carries the resource type; the browser does not infer a second semantic documentation model from filenames after discovery.

## Runtime boundary

The documentation browser is a **separate top-level system window**, not a ManatOS `page`, `popup` or `embedded` UI level. Consequently it does not participate in entity-entry parent/child CTX topology, dirty-state aggregation, Save/Discard lifecycle or popup ownership.

The UI server owns a narrow read-only repository boundary:

- the manifest exposes the repository root `README.md` and recursively discovers supported documentation resources below the repository `docs/` root;
- content requests accept only supported resource paths that resolve inside that root, with the root `README.md` as the sole repository-root exception;
- both the browser and resource endpoints require an authenticated ManatOS session;
- no documentation mutation endpoint exists.

The browser escapes authored Markdown/source text before rendering supported presentation. Repository documentation remains authoritative; adding, removing or reorganizing supported files changes the discovered online tree without maintaining a second navigation catalogue.

## Deployment model

Repository discovery is the **development/source-tree provider**, not a requirement that a deployed web server contain the Git repository. The browser-facing contract is intentionally transport-neutral: a hierarchical manifest identifies documentation resources by relative path and resource type, and a read-only resource endpoint returns their bytes.

A deployed ManatOS installation should package the root `README.md` plus the `docs/` tree as a documentation bundle and expose the same manifest/resource contract from that bundle. A future public read-only documentation site can publish the same bundle on a static web server or CDN with a build-generated manifest. In that mode no ManatOS session, Node filesystem discovery, application database, or source repository is required.

Therefore deployment may change the **provider** (repository discovery, packaged bundle, or static hosting) but must not introduce a second authored documentation source. Markdown and documentation assets remain canonical; HTML is presentation output, not another maintained documentation copy.

## Architectural rule

Do not introduce a second online-documentation content model. Enhancements such as full-text search, heading navigation or audience-specific documentation roots should consume the same manifest/resource contract and authoritative documentation files through an appropriate read-only provider.

Return to the [System documentation map](README.md) or the [repository documentation map](../README.md).
