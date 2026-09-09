# Terminology

**SysBO** — System Business Object known through canonical metadata.  
**Canonical metadata** — domain/entity contract independent of a specific UI.  
**UI metadata** — presentation/interaction contract layered over canonical metadata.  
**CTX** — observable runtime context tree used by expressions, reactivity and diagnostics.  
**UI level** — one recursively nested active interaction surface.  
**Surface** — hosted interactive unit such as list, entry, selector or popup.  
**Entry representation** — canonical semantic name/type/description/status of a record.  
**Capability** — safe server-derived fact indicating whether a class of interaction is available; not a replacement for server authorization.  
**Fact** — safe observed value exposed for decisions but not persisted merely because it is in CTX.  
**Baseline** — original/accepted value against which dirty state is derived.  
**Projection** — derived/read-only representation of authoritative state.  
**Workspace** — compound editor owning aggregate working state and transaction semantics.  
**Platform** — product/domain contribution within the company composition model.  
**Application** — platform-level business capability represented in the domain model.
