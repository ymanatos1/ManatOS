# Selectors and Popups

Reference fields can open a record selector that reuses the target entity's canonical list/presentation semantics. Search, filters, paging and eligibility rules apply inside the selector. Selecting a record returns it to the owning field; clearing is available only when the invocation allows it.

Popups are nested UI levels. Closing a popup disposes its child context and returns interaction to the parent. A selector does not become the owner of the parent entry merely because it is temporarily the deepest visible level.
