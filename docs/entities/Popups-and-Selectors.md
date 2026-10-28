# Popups and Selectors

Popups and selectors are ordinary recursive client surfaces. `host = popup` describes **where** a surface is mounted; `kind` and `mode` describe **what it means** and how it operates. A popup is therefore not a detached mini-application with its own hidden state model.

```text
root page/list
  └── popup: entry
        └── popup: selector
              └── popup: entry
                    └── ...
```

Each child owns its own lifecycle and is attached to the caller through explicit invocation semantics.

## Popup capabilities

The generic popup/runtime infrastructure provides:

- nested child-surface creation and disposal;
- caller/invocation provenance;
- title/presentation/geometry host concerns;
- exact parent restoration when a child closes;
- result envelopes such as selected/saved/cancelled/closed;
- hosted entity-entry surfaces;
- record-selector surfaces;
- nested selectors and related-entry creation;
- CTX/debugger visibility for the active recursive level chain.

Popup capability itself is not entity-specific. Entity behavior comes from the surface hosted inside it.

## Selector capabilities

A record selector is a list-like child surface specialized for returning a record selection. It can reuse:

- canonical entity and list metadata;
- search/filter/order/paging;
- canonical entry representation;
- server-authorized candidate loading;
- reference-selection rules;
- current-record exclusion;
- one-to-one availability constraints;
- caller-specific ability to clear;
- related-entry creation where metadata allows it.

The selector returns **what was selected**. The caller decides what the result means—for example assigning a reference field, relating a hierarchy node or supplying another component input.

## Invocation contract

The caller provides semantic invocation data rather than mutating selector globals. Typical invocation facts include:

- target entity;
- calling field/component;
- purpose/mode;
- current record identity;
- current selected value;
- fixed/default values for related creation;
- eligibility/candidate policy;
- whether clearing is allowed.

Invocation belongs to the child surface contract and can be inspected in CTX.

## CTX ownership

A popup is represented as a child UI level. While it is open it can become the deepest/current level, but it does not take ownership of the parent's fields.

Closing the deepest child:

1. disposes that child and its descendants;
2. returns an explicit result to the caller when applicable;
3. restores interaction to the immediate parent;
4. leaves the parent's semantic state owned by the parent.

This is the same recursive model used for pages; only `host` differs.

## Entry hosting and ownership

**NG1/EJS1 UIS:** An Entry displayed in a popup is an ordinary Entry content runtime under a child `#level`. The popup host provides modal chrome, focus, keyboard/backdrop handling and result presentation. For example, the Angular `EntryPopupHost` composes the existing `EntryPageHost`; it does not create a duplicate Entry runtime or a second record-owner context.

**Established EJS0:** An older, distinct EJS implementation can host an Entry in a same-origin iframe. The iframe's own field and record lifecycle must be understood in the EJS0 context rather than used to define modern UIS ownership. Cross-window events remain host/result integration, not a general mechanism for copying semantic CTX between owners.

In either design, only a successful semantic result should update the invoking reference field. Dismissing the child is not equivalent to successful creation or commit.

## Related-entry creation

A reference selector can open a new target entry when metadata declares `createRelated`. Source values can be projected into defaults/fixed values and effective UI overrides. The new related entry is still a normal generic entry surface.

After successful creation:

- the child returns/reconciles the created record;
- the selector/caller can refresh availability;
- the owning reference field receives the canonical id/value;
- the created entry surface closes according to its normal lifecycle.

## Error/retry semantics

Failures remain owned by the active child operation. Retrying should go through the popup/action contract rather than storing a mutable callback on `window`. Cancel/close should dispose the child without mutating the caller unless the child explicitly returned a successful semantic result.

## Browser implementation boundaries

EJS0 publishes some popup functions through its namespaced browser runtime, while NG1 and EJS1 use their UIS adapters and surface-host contracts. Browser globals, iframe mechanics and component selectors are implementation details, not universal public APIs. They must not replace the declared invocation, child lifecycle and result contracts.

See [Using Selectors and Popups](Using-Selectors-and-Popups.md), [Client Context Model](../context/Client-Context-Model.md), and [Entity Lists](Entity-Lists.md).

## Nested surfaces and returned identity

A selector is a reusable List presented in a nested host, not a separate selector-only query engine. The invoking field supplies entity, selection and context requirements. The List consumes the standard resource/API contract and returns the selected record identity through the declared invocation/result channel. An Add-related action may similarly use an Entry surface in a popup host.

The nested level occupies `ctx.ui.level.level...` and is owned by its host instance. Parent state survives child opening and closing. Cancelation returns no selection and must not silently clear a previously selected reference. Any newly created related identity remains subject to authoritative persistence and authorization semantics rather than being inferred from the modal closing successfully.

See [UIS Architecture](../clients/UIS-Architecture.md) and [UI Surfaces and Levels](../clients/UI-Surfaces-and-Levels.md).
