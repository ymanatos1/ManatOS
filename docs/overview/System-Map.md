# ManatOS System Map

## Semantic system and current repository/runtime map

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

The workspaces are separate implementation units but participate in one semantic system. The shown `ui` workspace is the **current Express web client implementation**, not the only client architecture ManatOS permits. `shared` supplies contracts rather than acting as a second runtime owner for API or UI concerns.

## Runtime request boundary

In the current web implementation the UI and API are separate processes. Deployment may expose them behind one site, but server business/storage contracts do not depend on that topology. The API remains the authority for protected business operations; each client owns only its own interactive presentation state. Future Angular/React/mobile clients may use different presentation hosts while consuming the same server contracts.

## Metadata path

```text
canonical entity metadata -------> API/business/storage understanding
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
Foundation-level technical Company domain
  +-- Users / Account
  +-- Principals / hierarchy / contact values
  +-- Licenses
  +-- External Authentication Providers
  +-- foundation-level navigation/capabilities
  +-- Platform: protoCRM
        +-- Applications
        +-- Apps Playground
        +-- future platform/application tools
```

For portable client/UI semantics see [Client and UI Architecture](../clients/Client-Architecture.md). For deeper treatment, continue with [Architecture](../README.md), [Design](../README.md), or [Application Design](../README.md).

For storage specifically, see [Data and Storage Architecture](../storage/Data-and-Storage-Architecture.md) and [Storage Catalog](../storage/Storage-Catalog.md). For request correlation, logs, Operation Context and CTX snapshots, see [Diagnostics and Observability Architecture](../diagnostics/Diagnostics-and-Observability-Architecture.md).

## Client surface topology

```text
ctx.ui.level                         page host
    |
    +-- level                       popup or embedded child
         |
         +-- level                  further child when owned
```

The current browser runtime has one production host authority for this topology. `page`, `popup`, and `embedded` are the fundamental host choices. Entry/list/selector/custom identify what a level is presenting; `uiView` independently selects a named entity-record presentation such as `main`, `account`, or `quick`. This prevents presentation variants from becoming parallel runtime architectures.
