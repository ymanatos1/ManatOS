# UI Architecture

## Responsibility

The ManatOS UI engine converts server facts, metadata and invocation into an interactive client runtime.

```text
API facts + metadata + invocation
              |
              v
       UI level construction
              |
              v
          CTX runtime
       /      |       \
 expressions fields  components
       \      |       /
              v
             DOM
```

The client owns UI topology. Server-rendered HTML may provide shell/bootstrap material, but it is not an alternative runtime authority.

## Pages and popups

Pages and popups are hosts for the same surface model.

```text
page level
  |
  +-- popup level
        |
        +-- popup level
              |
              +-- ...
```

Opening a child appends a level to the active chain. Closing it disposes descendants and restores the immediate parent. Nesting depth is not fixed.

## Entry runtime

Entry UI is metadata-driven. The runtime owns field values, validation, calculated values, UX state and actions.

```text
canonical metadata ----+
UI metadata -----------+---> entry runtime ---> CTX ---> DOM
API record/facts -------+
invocation/defaults ----+
```

Create, edit and view are modes of the same semantic entry kind.

## List runtime

List surfaces own query/list state and records. A list does not acquire entry-level `fields` merely because it displays record columns. If inline editing is introduced, editable row state belongs to a row/edit workspace with explicit ownership.

## Selectors

A selector is a list-like surface opened with selection semantics. Invocation identifies the source and target. Selection returns a semantic result to the caller; the selector does not mutate unrelated parent state directly.

## Components

Reusable components consume metadata and CTX rather than entity-specific globals. Component-owned read models are exposed through `resources` when they need host-neutral runtime data.

## Actions

Entry/list actions are metadata inventory plus declarative policy. Visibility, availability and disabled reason are evaluated from CTX facts. Transaction readiness such as dirty/valid/saving state composes with action policy under one UI owner rather than creating competing writers to the same control.

## Rendering boundary

Static server rendering is an implementation transport, not the semantic owner of UI decisions. Interactive decisions are evaluated by the client against live CTX.
