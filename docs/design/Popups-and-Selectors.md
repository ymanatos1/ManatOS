# Popups and Selectors

Popups use the same UI-level runtime model as pages. `host = popup` describes mounting; `kind` and `mode` describe semantics and operation.

```text
root page
  +-- popup: selector
        +-- popup: entry
              +-- popup: ...
```

A popup records caller provenance in `invocation`. Closing a popup disposes its descendants and restores the exact immediate parent.

Selectors return selection results to their caller. Entry popups own their own entry field lifecycle. Popup nesting is therefore ordinary recursive UI composition rather than a special detached context mechanism.

The browser popup subsystem exposes one namespaced runtime surface under `ManatOS.popup`: `runtime` owns generic popup lifecycle/placement, `entry` opens hosted entry surfaces, and `recordSelector` opens selector surfaces. Popup capabilities must not be published as independent top-level `window.ManatOS*` globals; namespacing keeps the browser integration surface explicit without changing CTX ownership.

## Hosted entry ownership boundary

A same-origin iframe used to render a full metadata entry is a presentation host boundary, not a license to duplicate semantic state. The iframe owns the canonical entry CTX for its live `fields`, `entry`, `facts`, validation and aggregate state. The outer popup level owns only popup-host concerns such as invocation provenance, presentation/title, popup geometry and lifecycle.

The outer window must not deep-copy the hosted entry's CTX on `manatos:ctx-change`/`manatos:ctx-ready`. Such a copy would be a shadow semantic owner with independent object identity and timing. Cross-window communication is limited to explicit host concerns and the canonical result envelope (`saved`, `cancelled`, `closed`).
