# Troubleshooting

For development failures, run the repository verification command and address the earliest lint/format/build/test failure before interpreting downstream errors. For UI behavior, correlate the owning CTX level, field/state value and API traffic.

If a control is missing/disabled, inspect capability facts and dynamic UI metadata. If a selector changes the wrong field, verify the owning entry level rather than the current deepest level. If displayed reference text is inconsistent, verify canonical entry representation rather than adding local formatting.

Server/API errors should be investigated from the structured failure response and server logs; secrets must not be copied into diagnostics.
