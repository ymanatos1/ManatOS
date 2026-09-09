# ManatOS System Map

## Repository/runtime map

```text
                         ManatOS
                            |
        +-------------------+-------------------+
        |                   |                   |
      shared               API                  UI
        |                   |                   |
 domain contracts      HTTP boundary       server-render host
 metadata              authentication      browser UI engine
 policies              authorization       CTX runtime
 expressions           business commands   metadata presentation
 platforms             storage boundary    components/workspaces
        |                   |                   |
        +-------------------+-------------------+
                            |
                         protoCRM
                  current concrete platform
```

The workspaces are separate implementation units but participate in one semantic system. `shared` supplies contracts rather than acting as a second runtime owner for API or UI concerns.

## Runtime request boundary

The UI and API are separate processes. Deployment may expose them behind one site, but business/UI code does not depend on that topology. The API remains the authority for protected business operations. The browser remains the authority for interactive UI state.

## Metadata path

```text
canonical SysBO metadata --------> API/business/storage understanding
           |
           +----------------------> UI metadata composition
                                      |
                                      v
                              list / entry / component
                                      |
                                      v
                                     CTX
                                      |
                                      v
                            expressions + interaction
```

## Interactive state path

For entry fields, live scalar authority is intentionally singular:

```text
fields.<k>.value  -----> entry.current.<k>
       |
       +---------------> derived field dirty

fields.<k>.originalValue -----> entry.original.<k>
```

The projected records are convenient read models, not alternative mutation stores.

## Security path

```text
user/session facts
      |
      +--> UI capability projection --> presentation decision
      |
      +--> API authorization --------> protected operation
```

The two paths serve different purposes. Presentation can explain or suppress an unavailable operation; the API independently authorizes every protected command.

## Application composition

```text
Company
  +-- company-wide entities/navigation/capabilities
  +-- Platform: protoCRM
        +-- platform entities/navigation
        +-- Applications
        +-- licensing/access semantics
        +-- domain-specific UI and behavior
```

For deeper treatment, continue with [Architecture](architecture/README.md), [Design](design/README.md), or [Application Design](apps-design/README.md).
