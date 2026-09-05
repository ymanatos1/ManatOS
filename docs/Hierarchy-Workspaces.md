# Metadata-driven hierarchy workspaces

Hierarchy workspaces are reusable transactional editors over an entity relationship graph. SysPrincipals is the first consumer, but the workspace must not know Principal field names or entity-specific rules. Invoking metadata supplies hierarchy-only identity/parent/root semantics, enum traits and visualization options; reusable entry name/type/icon semantics come from entity/entry metadata and `recordQuick` remains UI metadata.

## Entry representation

Hierarchy nodes do not own their own label/type/icon metadata. They consume the entity-level `entry` semantics and UI entry-icon presentation documented in `Entity-Metadata.md`. Hierarchy metadata remains responsible only for structural facts such as identity, parent/root fields and capability traits.

## CTX ownership contract

Collection owners expose `entriesOriginal[]` and live `entries[]`. Entry pages expose `entryOriginal` and live `entry`. This lets the generic entry renderer work under a list, hierarchy workspace or future aggregate owner without owner-specific data names.

A hierarchy-owned entry is resolved from the immediate owner's `entries[]` working set and must not issue a record GET: the owner can contain unsaved edits and `draft:*` identities. Saving such a child entry merges it back into the owner collection instead of persisting independently.

## recordQuick

`recordQuick` is generic compact UI metadata over canonical entity fields. It selects which fields are shown; it does not define a reduced record model. The same canonical field components render both full records and quick records. A provisional member is created in the owner `entries[]` with canonical defaults/relationship fields, while the quick editor remains an overlay. Existing committed nodes do not reflow until Quick Save; Cancel/Esc removes the provisional draft.

Boolean fields deliberately omit the normal field-tooling glyph/menu because the switch itself is the complete editing affordance. Other field components keep their existing glyph/menu behavior.

## Structural operations and visualization

The workspace supports Add first, Add parent, Add sibling, Add child, Remove, Clear parent (detach), and drag/drop Move. A node with an existing parent does not offer Add parent. Clear parent remains visible in the node action menu but is disabled when there is no parent to detach. The action menu is portaled outside the graph viewport so tree/chart clipping cannot hide it.

Dragging member A onto member B means **Make child of B**; the target displays that semantic hint while dragging. Self-drops, descendant cycles, non-parentable source types and non-container targets are rejected from metadata traits.

Node icon composition intentionally emphasizes the entity subtype/type icon over the smaller entity icon behind it, making organization shape easier to scan without losing entity identity.

## Persistence boundary

All quick/full child edits and structural moves are owner-context operations. No API call is needed for recordQuick or in-memory hierarchy manipulation. The workspace **Commit** operation is the aggregate persistence boundary. It sends the complete owner `entries[]`/`entriesOriginal[]` working set to the generic aggregate-commit API, which resolves `draft:*` identities and applies create/update/delete changes atomically. In **Create Organization**, **Close** checkpoints the unfinished working graph to browser local storage and leaves without creating business records; after such a checkpoint, later mutations show **Unsaved changes since draft** and an explicit **Save draft** action. **Edit Organization** deliberately has no browser draft lifecycle: its single exit action reads **Close** while unchanged and **Cancel** once the working graph is dirty. A successful Commit clears every compatible Create Organization draft and returns to the owning entity list. Failed commits retain all working/draft state.

## Icon ownership

The entity/page icon remains the canonical SysBO definition icon used by navigation, list headers and entry headers. A hierarchy node may compose that entity icon with a metadata-declared type icon, but the visualization must never change the canonical entity icon to achieve the composition. The generic renderer supplies the canonical definition icon to the hierarchy component at render time; type icons remain canonical enum-item metadata.

## Browser-persistent drafts

An unfinished **Create Organization** draft is a client-side working artifact, not persisted business data. `Close`/`Save draft` stores the complete working `entries[]` plus its `entriesOriginal[]` baseline in browser `localStorage`, scoped by signed-in user and entity under a stable `create` identity. Edit Organization does not read or write drafts. The create-draft key deliberately does **not** contain the UI-server boot id, so navigation and a ManatOS restart do not discard unfinished create work. Legacy boot-scoped _create_ keys may be migrated, but legacy edit-workspace drafts are never restored into a new Create Organization session.

Draft loading is compatibility-tolerant: recognizable entry records are restored even when an older envelope contains an unfamiliar version marker or additional properties. Unknown envelope data is ignored. A successful Commit removes the active draft. Older boot-scoped draft keys are recognized as a migration source and copied to the stable key when restored.

## Add/relate interaction

Every hierarchy `+` affordance opens the same structural menu. New parent/sibling/child operations use the metadata-driven `recordQuick` editor. Existing nodes already in the working graph can be related without duplication. `Use existing entry…` opens a selection-mode, list-like browser over owner-supplied reference data; it filters and selects records without navigating to the full entry editor and without a component-owned API request. If a selected persisted entry is already represented in the working graph, the existing node is moved/re-related rather than duplicated.

The visualization and `ctx.page.page.entries[]` remain one synchronized working graph. The **Add existing node** submenu and **Add existing entry** selector both use the same relationship-eligibility contract and exclude no-op relations as well as invalid ones: the existing direct parent is not offered as a parent, current direct children are not offered as children, and entries already sharing the same parent are not offered as siblings. The selector expresses those exclusions through the canonical `filters.listExceptions` exclude-when-true formula; API/storage implementations apply the same query predicate before paging. Live `entries[]` values overlay persisted reference rows so uncommitted re-parenting is reflected immediately. Drag/drop uses the same semantics defensively.

## Draft close and existing-entry selection

Create Organization exposes **Cancel**, **Close** (checkpoint and leave), **Save draft** when the graph differs from the last checkpoint, and **Commit**. Edit Organization has no draft controls and one dynamic **Close/Cancel** exit action. **Commit** persists the complete valid graph transactionally and, on success only, closes the workspace back to the entity list. Drafts are user work rather than cache data; loaders therefore recover recognizable fields from older draft shapes and ignore unknown/incompatible extras where possible.

The existing-entry picker is a selection-mode reuse of the metadata-driven list presentation. It shares the normal list toolbar, filter, table-header and paging partials, omits create/actions/navigation semantics, supports single-click selection and double-click selection/acceptance, and reports the contextual effect of the selection in the picker footer. Search is also a shared list-surface affordance. Selecting a database entry not yet present adds one persisted node directly with the requested parent/sibling/child relation. Selecting an entry whose node already exists reuses/repositions that node; the footer explains this before selection rather than adding another redundant confirmation popup.

While the selector is open, its list-like runtime lives below the owning workspace at `ctx.page.page.selections.existingEntry` (or the equivalent current workspace page path). It contains `entriesOriginal[]`, `entries[]`, filters, search, paging, operation/source facts and the selected id. It is a child interaction surface, not another page level, and is cleared when the popup closes. When Developer Tools are open the picker exposes a CTX shortcut that selects this branch in the existing CTX Viewer.

Persisted entries added to the graph are copied into both `entriesOriginal[]` (database baseline) and `entries[]` (working value). Relationship edits mutate only the working copy. Removing a persisted node from the workspace removes both copies because removing a node means removing it from this working aggregate, not deleting the database record implicitly.

Persisted nodes carry a small database marker in workspace mode. Draft nodes continue to use `draft:*` identities. The visualization and `ctx.page...entries[]` remain synchronized and are the authoritative working graph for Commit.

## Commit confirmation

Commit never fires immediately from the footer button. A non-dismissible confirmation popup has **Summary** and **Details** tabs: Summary counts new, changed, unchanged and removed persisted members; Details names the concrete members in each category. **Cancel** closes only the confirmation and returns to the unchanged chart; **Commit** proceeds with the existing atomic aggregate endpoint. Only a successful response clears the create draft and closes the workspace to the entity list.

## Embedded entry Organization tab

The Organization tab on an ordinary entity entry page is intentionally informational. It reuses the same Tree/Chart visualization and CTX data projection, but `interactionMode` is not `workspace`: nodes are not navigation links, cannot be dragged, and expose no structural mutation commands. Organization editing is reserved for the dedicated Create/Edit Organization workspace.
