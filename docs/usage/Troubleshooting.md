# Troubleshooting

Troubleshooting is most effective when the failure is located at its owning boundary instead of patched at the visible symptom.

## Development failures

Run the repository verification command and address the earliest lint, formatting, build or test failure first. Later failures can be secondary effects. For TypeScript/editor errors after source moves, verify that the editor is not retaining an obsolete deleted file before changing canonical imports.

## UI/runtime failures

Use CTX Viewer and API Traffic together:

```text
Unexpected UI behavior
   |
   +--> wrong/missing value? ----> inspect owning CTX level and field/state
   |
   +--> wrong enabled/visible? --> inspect capability + dynamic metadata inputs
   |
   +--> duplicate/missing data? -> inspect API Traffic and request ownership
   |
   +--> wrong reference text? ---> inspect canonical entry representation
```

Nested UI errors should be diagnosed against the owning level rather than merely the deepest currently open level. A selector, for example, can be the current leaf while the field it updates belongs to its parent entry.

Server/API failures should be interpreted from structured failure responses and server logs. Never copy credentials, session secrets or provider secrets into diagnostics.
