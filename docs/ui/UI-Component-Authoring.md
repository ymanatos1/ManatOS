# UI Component Authoring

ManatOS UI components are reusable presentation units. Their source should make the
metadata/CTX contract visible to a developer without requiring a reverse-engineering
pass through the caller or browser runtime.

## Component source header

Every reusable EJS component under `views/components/` and `views/popups/` should begin with one EJS comment using this arrangement:

```ejs
<%#
  COMPONENT: Human-readable component name

  Purpose:
  - What this component owns and, where useful, what it deliberately does not own.

  Inputs / metadata:
  - The important locals and canonical metadata consumed by the component.

  CTX contract:
  - Which canonical CTX values are read or written, or "None" for a purely presentational component.

  Embeds / delegates:
  - Child components/partials included by this component, or "None".

  Runtime contract:
  - Important data-* hooks, browser runtime, emitted events, or "None".
%>
```

The header documents contracts, not implementation trivia. Detailed comments inside the
component should explain non-obvious invariants, canonical-vs-presentation distinctions,
or reasons for behavior. Do not narrate obvious markup.

## Layout and line length

Use two-space indentation and blank lines between setup, major markup regions, and
embedded components. Prefer one HTML attribute per line once a tag no longer scans
comfortably on one line. Likewise, format EJS include argument objects vertically when
they contain more than a few values.

The repository Prettier width is 100 characters. EJS is not reformatted mechanically by
Prettier, so treat 100 as the normal readability target rather than forcing dense EJS onto
one line. A longer line is acceptable only when splitting it would make the template less
clear; very long markup/expression lines should be refactored.

## Metadata and CTX rules

Components consume canonical metadata instead of duplicating entity-specific behavior.
CTX-bound field controls use the shared `data-ctx-field` contract; a component must not
invent a parallel state model merely for presentation. Derived/calculated behavior stays
in canonical metadata/runtime expressions rather than being reparsed or reimplemented in
the EJS template.

Popup components use the shared popup lifecycle and canonical
`ctx.<leaf-page>.popup` projection. Popup CTX inspection belongs in the header immediately
before Close/X; individual popup bodies must not choose arbitrary CTX-button placement.

The CTX action is a z-order toggle. Its first activation raises Developer Tools above the
popup and selects the relevant CTX path; the next activation returns Developer Tools behind
the popup without closing either surface. This behavior belongs to the shared popup runtime,
not to individual popup implementations. Developer Tools must also be size-contained so
expanding a large CTX subtree cannot increase the application shell/document height.

## Composition

Prefer small reusable components with explicit inputs. A dispatcher/wrapper should say so
in its header and remain mechanical. When a component embeds another component, pass the
minimum contract needed by the child and document that delegation in the parent header.

## Folder taxonomy

Component placement follows the UI responsibility a component **owns**, not the entity that invokes it or the lower-level controls it happens to render. The current taxonomy is:

```text
views/components/
├── auth/
├── debugging/
├── layout/
├── navigation/
├── presentation/
└── sysbo/
    ├── list/
    ├── entry/
    │   ├── shell/
    │   ├── fields/
    │   └── content/
    └── hierarchy/

views/popups/
├── auth/
├── illustrations/
├── messages/
├── preferences/
├── selectors/
└── shared/
```

Use these ownership rules consistently:

- canonical metadata-driven entry field -> `sysbo/entry/fields/`;
- entry page/tab orchestration -> `sysbo/entry/shell/`;
- composite content hosted by an entry tab -> `sysbo/entry/content/`;
- browse/list presentation -> `sysbo/list/`;
- hierarchy workspace interactions -> `sysbo/hierarchy/`;
- generic visual/help surfaces -> `presentation/`;
- modal/popup workflows -> `views/popups/`, even when they reuse SysBO list or field components.

Do not create entity-specific component folders such as `principals/` or `licenses/` for behavior that belongs to reusable metadata/CTX infrastructure.

Browser runtimes mirror the same responsibility boundaries where there is a dedicated runtime:

```text
public/js/
├── popups/
│   ├── popup-runtime.js
│   └── record-selector.js
└── sysbo/
    ├── entry/field-runtime.js
    └── hierarchy/
```
