# Adding UI Metadata

UI metadata describes list columns/filters/actions, entry tabs, field/component presentation and dynamic UI policy. Keep canonical business semantics in BO metadata.

Prefer static metadata for constants and expression-backed dynamic values for side-effect-free decisions based on observable context. Use canonical field keys and reusable component identifiers. Reference/enum presentation should reuse canonical entry/option representation.

After adding metadata, verify effective metadata resolution, create/edit/view behavior, dependency reactions and relevant list/entry rendering. Do not add browser entity-name checks to compensate for metadata that can express the rule.
