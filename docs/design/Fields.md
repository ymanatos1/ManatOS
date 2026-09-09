# Fields

A canonical entity field is dispatched through reusable field-component infrastructure. Text/date/reference/enum and other semantic types share common metadata and state contracts; visual specialization does not create a second data authority.

### Scalar authority

```text
fields.<key>
├── value          live authority
├── originalValue  baseline authority
├── dirty          derived
├── valid          derived/validation state
├── validationIssues[]
├── option          selected enum/reference decoration
├── options[]       available choices when applicable
└── ux              effective presentation state
```

A user edit, selector return or programmatic field mutation converges on the same field mutation boundary. Baseline changes use the baseline boundary. Generic CTX mutation normalizes field-value writes through that authority instead of bypassing it.

Entity field controls are distinct from workflow/system inputs. A sign-in password, search box or provider-secret editor may look like a form field but is not automatically a canonical SysBO field.

See [Component Catalog](../reference/Component-Catalog.md) and [Metadata Catalog](../reference/Metadata-Catalog.md).
