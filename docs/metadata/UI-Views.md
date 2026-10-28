# Named UI Views

A **UI View** selects a presentation of a canonical entity without redefining that entity. Different screens may show different columns, tabs, field presentation or related-record collections for the same business object while sharing the same identity, validation rules, relationships and API authorization.

The important architectural distinction is between *entity-wide canonical semantics*, *common UI metadata* and *one selected UI View*. A view changes presentation, not the meaning or authority of a field.

## Entry view resolution

`shared/src/metadata/ui/view-resolution.ts` defines `resolveSysBOUIView`. It chooses a requested view key, or `defaultUIView`, falling back to `main`. When no explicit `uiViews` catalogue exists, an implicit `main` view of type `full` is accepted. An unknown explicit view fails rather than silently choosing an unrelated one.

The effective metadata is composed from the common record declaration and the selected view contribution. Scalar overrides are applied selectively; view-level tabs and content may replace common equivalents. Field overrides merge **by field key**, and the nested `presentation` members merge so that adjusting one setting does not erase unrelated declarations. Entry actions compose by key. A view declared read-only also hides configured save/delete actions in the resolved record presentation.

This operation produces a **resolved view projection**. It does not mutate the original canonical entity definition.

## List view resolution

`resolveSysBOUIListView` uses `metadata.list.common` and the chosen `metadata.list.views[key]`. A specific list view can define different list presentation, columns or settings. Its existence does not change the authorization of rows or the server's query rules. Unknown keys are rejected.

## Related-record collection views

`resolveSysBOUIRelatedCollection` composes reusable related-list views from the referenced entity metadata with relationship-specific contributions. Relationship-level display overrides remain authoritative for that occurrence, including layout, labels, row links and field-level settings. This allows the same related entity to appear differently in two relationship contexts without copying its entire metadata declaration.

```text
Canonical entity + relationships
                │
      Common UI metadata
                │
    Requested named view
                ▼
 Resolved presentation metadata
                │
   Generic List / Entry runtime
                ▼
      UIS rendering adapter
```

## Design consequences

- Use distinct view keys for different **encounters with an entity**, not for alternative definitions of what the entity is.
- Place reusable presentation defaults in common UI metadata; specialize only the differences in a named view.
- Keep underlying enum definitions, references, validators and API permissions canonical.
- Pass the selected view key explicitly where navigation, popup invocation or relationship context requires it.
- Do not treat a requested view as trusted authorization input. A visually hidden or read-only control is not an API security decision.

## Example

A Guard may appear in a broad administration List, a compact selector launched from a surveillance Post and an Entry view concentrating on contact details. Those views share Guard record identity and canonical fields. Their visible content and allowed *UI actions* may differ; the API still applies the same authoritative record and operation policies.

The example illustrates view reuse; it does not assert that every hypothetical Guard screen has been implemented.

See [Metadata Architecture](Metadata-Architecture.md), [UI Metadata](Adding-UI-Metadata.md), [Entity Lists](../entities/Entity-Lists.md) and [UIS Architecture](../clients/UIS-Architecture.md).
