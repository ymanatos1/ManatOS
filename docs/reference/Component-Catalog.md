# Component Catalog

## Field components

Canonical entity fields are rendered through the field-component dispatcher. Specialized controls exist for semantic types such as text/date/reference/enum while preserving the same field state authority and tools contract.

## Entry content components

Reusable content includes collection editor, date/duration range, provider credentials, readonly value, related collections, summary and workflow input components. A content component can coordinate several values or a workflow; it should not redefine canonical field semantics.

## Page/runtime components

Reusable EJS composition includes entity list/entry runtime hosts, entry page/title bar, navigation, layout/busy overlay, contextual help and information panels.

## Debugging components

Developer Tools compose CTX Viewer, API Traffic and debugging CLI/panel surfaces.

## Ownership rule

Use a field component when the control represents a canonical entity field; a composite/content component when several fields/resources form one semantic interaction; and a system/workflow control for transient non-entity inputs. Visual resemblance alone does not determine component class.
