# Administration

Administration exposes system and business-object management surfaces according to the authenticated user's capabilities. Admin has full administration access; Superuser has read-only inspection of protected administration/platform data plus Apps Playground execution; User is organization-scoped; Guest is restricted. ManatOS company administration includes Users, Principals, Licenses and External Authentication Providers. protoCRM contributes Applications; additional platform-owned entities may appear as platforms evolve.

## Common entity administration

Entity administration normally starts with a generic metadata-driven list. Use filters/search/paging to find records, open an entry to inspect or edit it, and use Save or Save and Close to commit valid changes. New records use the same entry composition with metadata/default initialization instead of a separate hand-written form.

Actions can be record-specific. For example, deletion may be generally available for an entity but prohibited for a particular row by server policy. The UI can display that result and its reason, while the API remains authoritative.

## Relationships and compound areas

Related collections, selectors and hierarchy tabs expose domain relationships without asking administrators to manipulate foreign-key identifiers directly. Compound editors can have their own draft lifecycle and may prevent the parent entry from saving until the child operation is resolved.

For the generic interaction model see [Working with Entities](Working-with-Entities.md). Company-owned domain meaning is documented under [ManatOS Company Domain](../company/README.md); platform-owned meaning is documented under [Application Design / protoCRM](../apps-design/protocrm/README.md).
