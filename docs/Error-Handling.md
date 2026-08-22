# Error Handling

UI HTTP/navigation errors use `http-errors` and full error pages. Business/application failures use `AppError` and the common popup.

## Semantic operation tree

`AsyncLocalStorage` carries a request ID and nested semantic operations. When a nested operation succeeds, its child detail is pruned. If it fails, its complete failed branch survives while already-completed siblings remain as compact completed nodes.

Operations can attach selected context such as IDs, names and file paths. Sensitive names (`password`, `hash`, `token`, `secret`, `cookie`, `session`, API key, authorization) are automatically stored/displayed as `********`.

The same canonical error object can be serialized differently for:

- API caller;
- UI popup;
- bounded session error log;
- server log.

API detail level can be `none`, `basic`, `operations` or `full`. Production should normally avoid `full`.
