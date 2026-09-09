# Documentation

This documentation describes the system as it exists and the direction its contracts are intended to support. It is organized by **reading purpose**, not by source-code folder and not by implementation history.

A reader can stay within one area and obtain a useful, largely self-contained explanation. When another document is authoritative for a detail, the local document gives enough context to remain readable and links to the deeper treatment.

## Reading paths

| Reader / purpose                           | Recommended entry                                     |
| ------------------------------------------ | ----------------------------------------------------- |
| First technical overview                   | [Concepts](Concepts.md) → [System Map](System-Map.md) |
| Software / solution architect              | [Architecture](architecture/README.md)                |
| Engineer examining exact runtime semantics | [Design](design/README.md)                            |
| Contributor implementing changes           | [Development](development/README.md)                  |
| Application or platform designer           | [Application Design](apps-design/README.md)           |
| protoCRM domain reader                     | [protoCRM Design](apps-design/protocrm/README.md)     |
| User / administrator                       | [Usage](usage/README.md)                              |
| Reader looking up an exact contract        | [Reference](reference/README.md)                      |

## Core documents

- [System Overview](ManatOS.md) — purpose, scope, composition and boundaries.
- [Concepts](Concepts.md) — the vocabulary needed by the rest of the documentation.
- [System Map](System-Map.md) — processes, contracts and responsibility flow.
- [protoCRM](protoCRM.md) — the first concrete platform and how it exercises the foundation.
- [Glossary](Glossary.md) — concise definitions.
- [Documentation Map](Documentation-Map.md) — complete navigation map.

## Documentation contract

Documentation is factual rather than promotional. Architectural qualities should be visible through contracts, examples, invariants and responsibility boundaries rather than adjectives. Implemented behavior and intended direction are identified separately where that distinction matters.

The documentation intentionally contains no migration diary, patch history, development batches, retired designs or progress reports. Those are not part of the product model. See [Documentation Standards](Documentation-Standards.md).
