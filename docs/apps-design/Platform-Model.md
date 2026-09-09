# Platform Model

A platform is a product/domain contribution within the company context. It has a stable ID/code/name, presentation, navigation and entity contributions. Access can be governed by server-resolved platform capabilities.

Platform definitions live beside the platform domain rather than in a monolithic generic company module. This keeps product-specific navigation/assets/presentation out of the reusable core as additional platforms are introduced.

The current platform identifier is `protocrm`. It contributes application administration/navigation and is the concrete host for CRM-oriented application design.
