# Storage Adapters

Storage implementations conform to the storage adapter/repository contracts and should preserve query semantics rather than force callers to know the datastore.

A richer adapter may translate filters, paging, sorting and canonical exception predicates into native datastore operations. Keep predicates structured until that boundary. Relationship integrity and business authorization remain above raw persistence mechanics.

The current repository includes in-memory and JSON-file-oriented persistence support suitable for development/runtime scenarios. A relational adapter should translate supported structured predicates to SQL rather than fetching all rows and filtering in the browser.
