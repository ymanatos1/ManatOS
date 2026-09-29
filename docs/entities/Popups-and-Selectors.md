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

This is the same recursive model used for pages and embedded children; `host` controls mounting and parent-activation behavior. Popup children deactivate their parent while active, whereas embedded children deliberately leave their parent active.

## UI view versus popup host

A popup-hosted entry may request a named UI view, for example the Principal `quick` view. This does not create a special quick-popup runtime: `popup` is the host, `entry` is the semantic kind, and `quick` is the selected record presentation/view family. The dimensions remain orthogonal.

## Hosted entry ownership boundary

The current Express client can host a full metadata entry inside a same-origin iframe. The iframe is a **presentation host boundary**, not permission to duplicate semantic state.

The hosted entry owns its canonical live:

- fields;
- entry/current/baseline state;
- facts;
- validation;
- aggregate component state.

The outer popup level owns popup-host concerns such as invocation provenance, title, geometry and lifecycle. It must not deep-copy the iframe's CTX into a second outer semantic owner.

Cross-window communication is limited to explicit host/result contracts such as saved/cancelled/closed and other genuinely host-level signals.

## Related-entry creation

A reference selector can open a new target entry when metadata declares `createRelated`. Source values can be projected into defaults/fixed values and effective UI overrides. The new related entry is still a normal generic entry surface.

After successful creation:

- the child returns/reconciles the created record;
- the selector/caller can refresh availability;
- the owning reference field receives the canonical id/value;
- the created entry surface closes according to its normal lifecycle.

## Error/retry semantics

Failures remain owned by the active child operation. Retrying should go through the popup/action contract rather than storing a mutable callback on `window`. Cancel/close should dispose the child without mutating the caller unless the child explicitly returned a successful semantic result.

## Browser namespace

The current browser implementation exposes popup infrastructure beneath the namespaced `ManatOS.popup` surface. Generic lifecycle/placement, hosted entry and record-selector capabilities remain grouped there rather than publishing unrelated top-level globals.

This namespace is an implementation surface, not the architecture definition; another client can implement the same semantic popup/selector contract differently.

See [Using Selectors and Popups](Using-Selectors-and-Popups.md), [Entry Opening, Invocation and Optimization Audit](Entry-Opening-Invocation-and-Optimization-Audit.md), [Client Context Model](../context/Client-Context-Model.md), and [Entity Lists](Entity-Lists.md).
