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
