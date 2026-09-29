# Validation

Validation answers whether a candidate field, entry or aggregate state is acceptable. ManatOS separates immediate browser feedback from authoritative API/domain/storage enforcement, and it also distinguishes **canonical metadata semantics** from the concrete enforcement mechanisms currently implemented.

## Canonical declarations

Canonical field metadata can declare semantics such as required/nullability, length, enum domain, version grammar, uniqueness, reference meaning and normalization/calculation rules. These declarations describe the business object independently of a particular control or storage adapter.

UI metadata may narrow interaction for a particular view/invocation, but it must not weaken canonical or server-side rules.

A declaration does not by itself prove that one universal validator currently enforces that declaration at every boundary. When documenting or extending a rule, identify both its canonical metadata owner and the runtime/API/storage mechanism that enforces it.

## Browser validity

The production entry form currently derives scalar field validity from the rendered controls: controls participate through native `checkValidity()` and the field runtime/components can publish semantic errors through `setCustomValidity()`. Structured components can perform their own immediate parsing/interaction checks where the component contract requires them.

Field validity is then combined with private aggregate contributors by the shared entry aggregate policy. There is no separate semantic `validation:changed` event history that owns validity; current state is read from the controls/contributors when aggregate policy is evaluated.

Components should present validation, not create an entity-specific rule engine when the rule belongs in canonical metadata/runtime or authoritative domain logic.

## Aggregate validity and persistence blocking

Compound components can register private contributor facts with the owning form. A contributor may report `dirty`, `valid` and `blocksPersistence`. The shared policy combines contributor validity with scalar field validity and blocks Save while an active child editor or other contributor says persistence is unsafe.

`blocked` is not the same as `invalid`: an unfinished embedded member editor can temporarily block parent persistence without pretending its draft is already a persisted parent-field value.

## API and storage authority

The API never treats browser validity as an integrity or security boundary. Current authoritative enforcement is composed from concrete mechanisms rather than one monolithic generic validator. These include canonical normalization in the generic service, metadata-defined uniqueness in repository/storage behavior, persisted calculations before commit, entity/domain service invariants, relationship integrity/delete policy, authorization, trusted command validation and storage-adapter schema semantics.

Consequently, avoid claiming that every `required`, `maxLength`, enum or similar metadata declaration is already revalidated by a single generic API validation pass unless the implementation actually provides that enforcement. The architectural direction is canonical behavior across adapters/clients; the documentation must remain precise about current enforcement.

## Normalization versus validation

Normalization transforms a candidate into its canonical value; validation determines whether the candidate/state is acceptable. Canonical normalization expressions are evaluated by the normal expression machinery and the API applies metadata-declared normalization before persistence.

For example, contact-specific normalization can canonicalize acceptable input, while malformed structured input can be rejected by the appropriate component/domain boundary. The field component does not become the canonical owner of normalization merely because it presents the error.

## Failure behavior

A failed client validity check keeps the working transaction available for correction. A rejected API/domain/storage operation likewise does not promote the entry baseline. Successful persistence returns authoritative data, which becomes the new baseline.

See [Generic List and Entry Contracts](Generic-List-and-Entry-Contracts.md) and [Persistence, Commit, Discard and Recovery](Persistence-Commit-and-Recovery.md).
