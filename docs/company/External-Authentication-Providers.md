# External Authentication Providers

External Authentication Providers are ManatOS company-level system entities. They configure trusted identity-provider integrations used by the whole ManatOS environment rather than by protoCRM specifically.

Provider metadata can use the same generic entity/list/entry infrastructure as other system entities, while credentials, verification and runtime activation remain protected command/security concerns rather than ordinary editable entity-field behavior.

External identities link authenticated Users to provider identities, but provider secrets are never exposed through normal generic entity projections.
