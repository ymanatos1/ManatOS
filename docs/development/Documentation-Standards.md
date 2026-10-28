# Documentation Standards

## Describe the system, not its history

Published documentation explains what the software project/architecture is, how it works, its existing contracts and its architectural vision. It does not contain migration diaries, patch/batch history, retired designs, progress reports or “old versus new” narratives, TODO lists or implementation timelines.

## Write for a reader who has not opened the source

Important concepts require meaning, ownership, lifecycle, invariants, examples and relationships to surrounding concepts. Reference catalogs should make exact lookup possible without source archaeology.

## Demonstrate qualities rather than advertise them

Avoid unsupported adjectives such as “enterprise-grade”, “powerful” or “highly scalable”. Show the architecture, contracts, tests, security boundary and extension model and let the reader evaluate them.

## Permit purposeful overlap

Each subject area should remain readable on its own. Its subject README provides the subsystem picture, while focused documents own the authoritative deep treatment. The repository README intentionally restates every major subsystem in compressed form so it can stand alone; avoid creating competing detailed definitions elsewhere.

## Separate implemented behavior from direction

Future/intended capabilities may be documented when useful, but must be explicitly identified as direction. Never phrase an aspiration as an implemented feature.

## Use the project name sparingly

“ManatOS” identifies the overall system/repository. Within its own documentation, prefer “the system”, “the foundation”, “the runtime”, “the API”, “the UI”, or the precise subsystem. Repeating the product name in every paragraph adds noise rather than clarity.

## Keep links and catalogs current

A structural or contract change is incomplete until the corresponding subject documentation is updated.


## Project identity and naming

The repository documents a software project and architecture, **not a corporation**. Do not describe it as a company or imply registered corporate status. `Company` is a technical domain and metadata scope for Users, Principals, Licenses and related concepts; describe it as such when introducing the term.

Use the proper project name when it is needed for identification, then prefer precise subsystem subjects or natural phrases such as “the system”, “the API” or “the runtime”. Do not repeat the project name as a rhetorical prefix in every heading or paragraph.

## Depth before simplification

Maintain professional, restrained and technically exact prose. Start each major subject with a concise conceptual explanation, then develop architecture, ownership, contracts, interactions, examples, invariants and security considerations thoroughly. Do not substitute slogans or beginner-oriented simplification for the technical detail expected by architects, developers, designers and auditors.

## Source evidence

Implementation descriptions refer to real TypeScript paths and executable boundaries; examples must distinguish abbreviated real contracts from illustrative pseudocode. A component's registration is not evidence that every client implements its full behavior. The documentation can explain intended semantic invariants, but it must never represent unrealized behavior as operational. Avoid chronological progress commentary even when describing an implementation boundary.

## Viewer-safe Markdown

Author documents as ordinary UTF-8 Markdown under the established hierarchy. Prefer relative Markdown links, fenced code, text diagrams and images whose rendering works in both GitHub and the application Documentation Browser. Keep existing paths stable when their subject remains valid; validate links and navigation after structural edits.


## Character-based diagrams and technical exposition

Use compact fenced text diagrams to orient the reader where identity, hierarchy, ownership, trust boundaries or execution flow is easier to understand as a spatial relationship. Diagrams must be technically accurate, concise and accompanied by prose that explains important constraints not visible from the lines. Choose box/tree/arrow direction deliberately; avoid decorative diagrams that merely restate a heading.

Place a simple structural diagram early when it improves orientation, followed by deeper contracts and examples. Preserve UTF-8 Markdown, compatible relative links and the existing Documentation Browser's rendering expectations. Complex generated diagrams may complement text diagrams but do not replace authoritative prose.

## Documentation scope

This repository is the TypeScript application foundation reference. Other client technologies may be mentioned briefly to explain UIS portability, but their implementation internals, migration, acceptance or parity are not part of this documentation. The root README is a substantial technical introduction; subject documents deepen architecture rather than become product tutorials.

The multi-application design platform is protoCRM. Panoptes is a concise special-purpose application example, not an equal second focus. Commercial authorization is documented as a coherent role/principal/organization/license/resource policy architecture, with implemented enforcement distinguished from model semantics rather than hidden in development-status reports.
