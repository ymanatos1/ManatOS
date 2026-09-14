# Component Catalog

This catalogue describes the reusable **metadata components** currently present in the ManatOS client architecture. Field-type components are catalogued separately in [Field Components](Field-Components-Detail.md).

Canonical UI metadata names semantic component keys. The current Express/EJS client maps server-rendered component keys in `ui/src/presentation/metadata/component-registry.ts`; browser-mounted components can intentionally have no EJS partial.

## Registered/current component keys

| Component | Purpose | Main capabilities / ownership |
| --- | --- | --- |
| `information-panel` | Read-only explanatory/status content. | Presents metadata-provided information without becoming entity state. |
| `contextual-help` | Context-sensitive help content. | Presents guidance adjacent to a surface/section; no persisted value ownership. |
| `provider-credentials` | Trusted external-auth provider credential workflow. | Specialized command-oriented UI for credentials that must not be exposed as ordinary entity fields; status/commands remain API-authoritative. |
| `date-duration-range` | Coordinates start date, structured duration and end date fields. | Composes existing canonical fields and calendar expression semantics; does not create a second date-range entity model. |
| `collection-editor` | Edits an owned/related collection as part of an entry transaction. | Owns child draft lifecycle, adds/edits/removes rows, contributes aggregate dirty state, reconciles on parent save. Used by contact-information editing. |
| `hierarchy-tree` | Browser-mounted hierarchy/organization workspace presentation. | Works over a hierarchy workspace draft, supports relationship operations and Tree/Chart-style semantic views as provided by the workspace/UI metadata. It intentionally has no server partial in the component registry. |

The registry can grow; this table should be updated whenever a reusable component key is added.

## How metadata selects a component

A UI metadata node of `kind: 'component'` declares the semantic component key and its configuration. The generic entry-tab renderer asks the implementation registry for a server partial. A `null` partial means the current web client expects browser mounting against the generic component marker rather than failing as an unknown entity-specific special case.

## Component contract

Reusable components should have explicit:

- metadata/configuration input;
- owning surface/entry;
- CTX/resources they consume or publish;
- private runtime state;
- semantic output or aggregate-state contribution;
- lifecycle/disposal;
- events/actions;
- authorization dependencies;
- tests across every entity that can use the component.

See [Components](Components.md) for the architecture and [Adding a Component](Adding-a-Component.md) for extension guidance.
