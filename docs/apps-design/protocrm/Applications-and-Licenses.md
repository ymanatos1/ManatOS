# Applications and Licenses

Applications represent platform-owned business capabilities. Licenses associate customer/principal scope with platform/application scope and validity/status rules, allowing application access and commercial relationships to be represented explicitly rather than embedded in navigation or UI code.

## License structure

A License currently demonstrates several important generic mechanisms: reference fields, platform/application restrictions, date and duration semantics, calculated/presented status, defaults and related-record presentation.

```text
License
├── customer / owning principal relationship
├── platform reference
├── application reference
├── validity start / duration / end semantics
├── status
└── enabled / policy-relevant state
```

Application choices can be restricted by the selected platform. Date/duration fields can participate in assisted calculations without becoming a special persistence model. Status presentation derives from canonical state rather than being independently maintained as decorative UI text.

## Related presentation

Principals and Applications can expose Licenses through generic read-only related collections. The related view consumes the same canonical metadata and entry representation used elsewhere instead of defining local row formatting.

## Security boundary

Platform access is exposed to the UI as a safe server-derived capability. The browser does not infer authorization by reading raw license records. This keeps license data, access policy and UI presentation as distinct responsibilities.
