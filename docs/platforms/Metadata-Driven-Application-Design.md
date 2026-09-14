# Metadata-Driven Application Design

A typical design sequence is:

```text
business concept
  → canonical entity fields/relationships/calculations
  → canonical entry representation
  → authorization and persistence semantics
  → list/entry UI metadata
  → dynamic expressions
  → reusable components for compound behavior
  → platform navigation/application composition
```

This sequence keeps presentation from defining the domain backwards. It also makes the application consumable by generic infrastructure: lists, selectors, related collections, CTX, diagnostics and future storage/client implementations can reason about the same contracts.
