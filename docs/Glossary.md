# Glossary

This glossary is the quick lookup for terminology used throughout the ManatOS documentation. [Concepts](Concepts.md) provides the explanatory introduction.

| Term                   | Meaning                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Application            | Platform-level business capability composed on ManatOS.                                                       |
| Application Foundation | Reusable semantic/runtime foundation used to compose platforms and applications.                              |
| Baseline               | Original state against which editable working state is compared.                                              |
| Capability             | Authoritative statement about whether an operation is permitted in context.                                   |
| Company                | Top-level product/catalog owner that composes company-wide and platform behavior.                             |
| Component              | Reusable metadata/CTX-driven UI behavior with explicit ownership.                                             |
| CTX                    | Observable runtime context tree used by expressions, UI runtime behavior, and diagnostics.                    |
| Dependency             | Observable input whose change can invalidate derived behavior.                                                |
| Dirty                  | State indicating live/working data differs from its baseline.                                                 |
| Entry                  | Interactive representation of one business-object record.                                                     |
| Expression             | Declarative, side-effect-free calculation or decision in the ManatOS expression language.                     |
| Fact                   | Observable runtime information that is not a persisted entity field.                                          |
| Field state            | Runtime state owned by one entry field, including live value, baseline, validation, and derived properties.   |
| Metadata               | Structured description of business or UI semantics consumed by generic infrastructure.                        |
| Platform               | Coherent product/domain environment composed on the ManatOS foundation.                                       |
| Popup                  | Child UI level with explicit lifecycle and caller/owner semantics.                                            |
| Principal              | Identity/organization-side business entity used by protoCRM relationship and organization behavior.           |
| protoCRM               | Current concrete ManatOS platform.                                                                            |
| Resource               | Owner-managed runtime data exposed for component/surface behavior without pretending it is a persisted field. |
| Selector               | List-like child surface that returns a semantic selection result to its caller.                               |
| Surface                | Internal runtime object represented publicly through a UI level.                                              |
| SysBO                  | Metadata-described System Business Object known to generic ManatOS infrastructure.                            |
| UI level               | One node in the recursive active page/popup UI chain.                                                         |
| UI metadata            | Metadata describing presentation and interaction independently of canonical entity semantics.                 |
| Workspace              | Owner-managed transactional working model for compound/aggregate editing.                                     |
