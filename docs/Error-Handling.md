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

## API response envelope

Successful API reads normally return:

```json
{
  "success": true,
  "data": {}
}
```

Successful commands return a root confirmation message:

```json
{
  "success": true,
  "message": "Action completed successfully.",
  "data": {}
}
```

All API failures expose the user-facing message twice deliberately: once at the root for simple UI/client consumption and once inside `error` so the error object remains independently meaningful:

```json
{
  "success": false,
  "message": "User-safe error message.",
  "error": {
    "code": "ERROR_CODE",
    "message": "User-safe error message.",
    "retryable": false
  }
}
```

API error detail level can be `normal`, `operations` or `full`. `operations` adds the semantic operation trace; `full` additionally exposes developer diagnostics and stack information. Production should normally avoid `full`.
