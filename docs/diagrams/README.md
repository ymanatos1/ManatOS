# Architecture diagrams

These diagrams are compact visual companions to the authoritative prose in `docs/` subject folders.
The `.dot` files are the editable sources; `.svg` is convenient for repository/browser viewing and `.pdf` for print/reference.

The diagrams distinguish the software foundation, the shared `Company` technical domain and protoCRM/application ownership and use **entity infrastructure** for the reusable metadata/CTX/storage framework. **SysBO** is reserved for system-owned business objects and is not a synonym for every future entity.

## Source and render formats

The `.dot` files are editable Graphviz sources. Matching `.svg` and `.pdf` versions make the diagrams usable through GitHub, the Documentation Browser and print. The diagrams are deliberately supplementary to the authoritative textual contracts: they show boundaries and data flow rather than specifying every option or runtime decision.

The client, UIS, Flow, localization and platform diagrams correspond to the current TypeScript architecture. `Company` in domain diagrams is a technical metadata domain, not a corporate identity.


## Text diagrams in subject documents

Architectural subjects also include fenced, character-based diagrams for quick orientation. These are intentionally maintained beside their explanations, render through GitHub and the application Documentation Browser, and make ownership or evaluation paths immediately visible without requiring a diagram renderer. Detailed `.dot`/`.svg`/`.pdf` companions remain useful where a richer visual representation adds information.


## Focused architectural diagrams

- [Foundation, shared domain and applications](01-domain-model.svg) — the software foundation, protoCRM and a special-purpose application.
- [Authorization policy layers](11-authorization-policy.svg) — the distinction between implemented role/record checks and full commercial entitlement semantics.
- [Application design and runtime boundaries](12-application-design-runtime.svg) — integrated and independently hosted runtime forms.

The corresponding `.dot` sources and PDFs are included, together with the [combined printable diagram collection](ManatOS_Architecture_Diagrams_A4.pdf). These visual companions supplement the source-backed contracts in [Authorization](../security/Authorization-Policy-Architecture.md) and [Application Design](../platforms/protocrm/Application-Design-and-Execution.md).
