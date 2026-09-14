# Using Selectors and Popups

This guide shows the practical end-to-end behavior of the generic selector/popup contracts described in [Popups and Selectors](Popups-and-Selectors.md).

## Existing-record reference selection

A reference field can open the generic record selector using its canonical `referenceBOKey` and effective selection policy.

```text
Owning entry / reference field
        |
        | target + current value + invocation rules
        v
Record selector child level
  ├── authorized API catalogue
  ├── search/filter/order/page
  ├── metadata candidate restrictions
  └── canonical candidate representation
        |
        | select row
        v
semantic selected record/id
        |
        v
owning field canonical CTX mutation
```

The field does not scrape text from the popup DOM. The selector returns a semantic result.

## Example: Principal parent

For a Principal `parentId` reference, canonical metadata can exclude the current Principal and constrain candidates through enum traits/relationship policy. The selector runtime remains generic—it consumes the declarations instead of containing a `sys-principals` special case.

When the user selects a parent, `parentId` changes through the canonical field mutation path. Dependent calculations such as `rootPrincipalId` can then react/recompute.

## Example: platform/application reference

A License can constrain Application candidates according to Platform. The caller supplies/evaluates the relevant metadata policy; the selector presents only eligible/authorized applications.

If the authenticated user cannot read the referenced catalogue, the generic data-access layer can represent that catalogue as unavailable/empty for the field instead of crashing the whole entry.

## Clearing

Clear is an invocation capability. If allowed, it returns a semantic empty/null selection to the caller. The selector itself should not assume every reference is nullable.

## Creating a related record

When `createRelated` is declared, the selector can open a hosted target entry:

```text
source entry
   -> reference selector
      -> Create related
         -> target entry child level
            -> source-projected defaults/fixed values
            -> user edits
            -> save
         <- saved target record
      <- selected target
   <- source reference field updated
```

This path reuses the normal entity-entry runtime, validation, authorization and persistence flow.

## Nested ownership

If the target entry itself opens another selector, the CTX chain simply grows one level deeper. Closing the nested selector restores the target entry; closing the target entry restores the original selector; closing the selector restores the source entry.

No parent field becomes owned by a child popup.

## View-only entry popup

A caller can host an existing entry in view mode. The same entry metadata/type-aware components can render the record while effective capabilities suppress editing actions. View mode is therefore not a second handcrafted details page.

## Diagnostics

While a selector/popup is active:

- CTX Viewer can inspect the active child level and invocation;
- expression tooling can inspect candidate/visibility rules;
- API Traffic shows catalogue/load/save requests;
- the parent's field state remains visible at its own level.

This makes nested interaction debuggable without flattening all state into a global popup object.
