# Documentation Standards

## Describe the system, not its history

Published documentation explains what the project is, how it works, its current contracts and clearly identified intended direction. It does not contain migration diaries, patch/batch history, retired designs, progress reports or “old versus new” narratives.

## Write for a reader who has not opened the source

Important concepts require meaning, ownership, lifecycle, invariants, examples and relationships to surrounding concepts. Reference catalogs should make exact lookup possible without source archaeology.

## Demonstrate qualities rather than advertise them

Avoid unsupported adjectives such as “enterprise-grade”, “powerful” or “highly scalable”. Show the architecture, contracts, tests, security boundary and extension model and let the reader evaluate them.

## Permit purposeful overlap

Each audience area should remain readable on its own. Briefly restate prerequisite concepts, then link to the authoritative deep treatment. Avoid copying long detailed passages into multiple authoritative locations.

## Separate implemented behavior from direction

Future/intended capabilities may be documented when useful, but must be explicitly identified as direction. Never phrase an aspiration as an implemented feature.

## Use the project name sparingly

“ManatOS” identifies the overall system/repository. Within its own documentation, prefer “the system”, “the foundation”, “the runtime”, “the API”, “the UI”, or the precise subsystem. Repeating the product name in every paragraph adds noise rather than clarity.

## Keep links and catalogs current

A structural or contract change is incomplete until the corresponding architecture/design/reference documentation is updated.
