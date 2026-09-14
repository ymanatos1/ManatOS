# Licensing

Licenses are ManatOS company-level records that govern customer/Principal access to platforms and, optionally, to a particular platform Application. A platform can therefore consume licensing policy without owning the License entity itself.

## License structure

A License currently demonstrates generic reference fields, platform/application restrictions, date and duration semantics, calculated/presented status, defaults and related-record presentation.

```text
License
├── customer / owning Principal relationship
├── platform reference
├── optional application reference
├── validity start / duration / end semantics
├── status
└── enabled / policy-relevant state
```

Application choices can be restricted by the selected platform. Date/duration fields can participate in assisted calculations without becoming a special persistence model. Status presentation derives from canonical state rather than being independently maintained as decorative UI text.

## Related presentation

Principals and platform Applications can expose Licenses through generic read-only related collections. The related view consumes the same canonical metadata and entry representation used elsewhere.

## Security boundary

Platform access is exposed to the UI as a safe server-derived capability. The browser does not infer authorization by reading raw License records. License data, access policy and UI presentation remain distinct responsibilities.
