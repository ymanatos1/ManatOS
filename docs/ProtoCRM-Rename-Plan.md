# mCRM -> protoCRM rename plan

`protoCRM` is the intended new code/display name for the current ManatOS CRM platform. Perform the rename as one dedicated migration after the current Organization workspace checkpoint is green rather than mixing platform-identity migration into hierarchy behavior changes.

The migration must cover canonical platform identity/display labels, shared/UI platform folders and imports, assets/CSS, CTX permission paths, configuration/default platform values, metadata expressions, licensing/platform references, tests, docs, Postman values and any persisted seed/data references.

Do not implement this as blind text replacement: code/module names, user-facing labels and canonical persisted platform identifiers are different concerns. Choose one normalized persisted key first, then migrate references atomically and add compatibility aliases only when required for existing data.
